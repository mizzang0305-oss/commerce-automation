using System;
using System.Collections.Generic;
using System.Diagnostics.Eventing.Reader;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
using System.Xml;

// Read-only, bounded EventLogReader loop. Never serialize raw XML or account names.
public static class Daily69OperationalLogQuery
{
    private const int OutputLimitBytes = 4 * 1024 * 1024;
    private static readonly int[] EventIds = { 100, 102, 107, 110, 129, 200, 201 };

    public static string Read(string xpath)
    {
        var query = new EventLogQuery("Microsoft-Windows-TaskScheduler/Operational", PathType.LogName, xpath);
        query.ReverseDirection = true;
        query.TolerateQueryErrors = false;
        var records = new List<Dictionary<string, object>>();
        var principalHashes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        using (var reader = new EventLogReader(query))
        {
            EventRecord record;
            while ((record = reader.ReadEvent()) != null)
            {
                using (record)
                {
                    if (!record.RecordId.HasValue || !record.TimeCreated.HasValue || Array.IndexOf(EventIds, record.Id) < 0)
                        throw new InvalidOperationException("TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID");
                    records.Add(Project(record.ToXml(), record.RecordId.Value, record.Id, record.TimeCreated.Value, principalHashes));
                }
                // Bound retained memory as well as the child stdout buffer. Never truncate.
                if (records.Count > 20000) throw new InvalidOperationException("DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT");
            }
        }
        var serializer = new JavaScriptSerializer { MaxJsonLength = OutputLimitBytes * 2 };
        string json;
        try { json = serializer.Serialize(records); }
        catch (InvalidOperationException) { throw new InvalidOperationException("DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT"); }
        if (Encoding.UTF8.GetByteCount(json) > OutputLimitBytes) throw new InvalidOperationException("DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT");
        return json;
    }

    public static Dictionary<string, object> Project(string xml, long recordId, int eventId, DateTime timeCreated, Dictionary<string, string> principalHashes)
    {
        var data = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
        using (var reader = XmlReader.Create(new StringReader(xml), settings))
        {
            while (reader.Read())
            {
                if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "EventData") continue;
                using (var subtree = reader.ReadSubtree())
                {
                    while (subtree.Read())
                    {
                        if (subtree.NodeType != XmlNodeType.Element || subtree.LocalName != "Data") continue;
                        var name = subtree.GetAttribute("Name");
                        if (String.IsNullOrEmpty(name)) continue;
                        // ReadString leaves the end element for the next Read, avoiding sibling skips.
                        data[name] = subtree.ReadString();
                    }
                }
            }
        }
        var taskName = Value(data, "TaskName");
        if (String.IsNullOrEmpty(taskName)) throw new InvalidOperationException("TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID");
        var result = new Dictionary<string, object> {
            { "eventRecordId", recordId }, { "eventId", eventId },
            { "timeCreatedUtc", timeCreated.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture) },
            { "taskName", taskName }, { "taskInstanceId", Value(data, "TaskInstanceId", "InstanceId", "TaskInstance") }
        };
        long number;
        if (Int64.TryParse(Value(data, "ProcessId", "EnginePID"), NumberStyles.None, CultureInfo.InvariantCulture, out number)) result["processId"] = number;
        var code = Value(data, "ResultCode", "Result", "ErrorCode");
        if (code.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            if (Int64.TryParse(code.Substring(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out number)) result["resultCode"] = number;
        }
        else if (Int64.TryParse(code, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out number)) result["resultCode"] = number;
        if (eventId == 100 || eventId == 102)
        {
            var identity = Value(data, "UserContext");
            if (!String.IsNullOrEmpty(identity))
            {
                string digest;
                if (!principalHashes.TryGetValue(identity, out digest))
                {
                    try
                    {
                        var sid = ((SecurityIdentifier)new NTAccount(identity).Translate(typeof(SecurityIdentifier))).Value.ToLowerInvariant();
                        using (var sha = SHA256.Create()) { digest = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(sid))).Replace("-", "").ToLowerInvariant(); }
                    }
                    catch (IdentityNotMappedException) { digest = ""; }
                    catch (ArgumentException) { digest = ""; }
                    principalHashes[identity] = digest;
                }
                if (!String.IsNullOrEmpty(digest)) result["principalSidSha256"] = digest;
            }
        }
        return result;
    }

    private static string Value(Dictionary<string, string> data, params string[] names)
    {
        foreach (var name in names)
        {
            string value;
            if (data.TryGetValue(name, out value) && !String.IsNullOrEmpty(value)) return value;
        }
        return "";
    }
}
