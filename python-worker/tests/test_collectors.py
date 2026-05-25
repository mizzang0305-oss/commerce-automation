import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.collectors.toss_link_importer import load_candidates_from_table


class CollectorFoundationTest(unittest.TestCase):
    def test_load_candidates_from_csv(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "links.csv"
            path.write_text(
                "product_name,url,selected_affiliate_url\n"
                "Spring Deal,https://example.com/deal,https://link.coupang.com/a/spring\n",
                encoding="utf-8",
            )

            candidates = load_candidates_from_table(path, source="toss_csv")

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].product_name, "Spring Deal")
        self.assertEqual(candidates[0].source_url, "https://example.com/deal")
        self.assertEqual(candidates[0].selected_affiliate_url, "https://link.coupang.com/a/spring")
        self.assertEqual(candidates[0].source, "toss_csv")

    def test_rejects_unsafe_candidate_urls(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "links.csv"
            path.write_text("product_name,url\nUnsafe,javascript:alert(1)\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "http/https"):
                load_candidates_from_table(path, source="manual_csv")


if __name__ == "__main__":
    unittest.main()
