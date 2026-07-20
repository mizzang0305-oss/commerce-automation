from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Literal
from urllib.parse import urljoin, urlparse, urlunparse


StockStatus = Literal["in_stock", "out_of_stock", "unknown"]
AuthorizationBasis = Literal["public_page", "owned_channel"]


@dataclass(frozen=True)
class CollectorAccessPolicy:
    allowed_hosts: tuple[str, ...]
    authorization_basis: AuthorizationBasis


@dataclass(frozen=True)
class PublicProductSelectors:
    product_name: str
    price: str
    image: str
    stock: str = ""
    seller: str = ""


@dataclass(frozen=True)
class CollectedProductRecord:
    schema_version: Literal["1"]
    product_name: str
    price: int | None
    image_url: str
    stock_status: StockStatus
    seller: str
    collected_at: str
    source_url: str
    raw_hash: str


def collect_product_from_html(
    html: str,
    source_url: str,
    selectors: PublicProductSelectors,
    policy: CollectorAccessPolicy,
    *,
    collected_at: str | None = None,
) -> CollectedProductRecord:
    """Extract one product fixture/page without making a network request."""
    try:
        from bs4 import BeautifulSoup
    except ModuleNotFoundError as error:  # pragma: no cover - dependency gate
        raise RuntimeError("BeautifulSoup collector dependencies are not installed") from error

    normalized_url = assert_allowed_source_url(source_url, policy)
    soup = BeautifulSoup(html, "html.parser")
    return collect_product_from_soup(
        soup,
        normalized_url,
        selectors,
        collected_at=collected_at,
    )


def collect_product_from_soup(
    soup: object,
    source_url: str,
    selectors: PublicProductSelectors,
    *,
    collected_at: str | None = None,
) -> CollectedProductRecord:
    product_name = _select_text(soup, selectors.product_name)
    price = _parse_price(_select_text(soup, selectors.price))
    image_url = _select_image(soup, selectors.image, source_url)
    stock_text = _select_text(soup, selectors.stock) if selectors.stock else ""
    seller = _select_text(soup, selectors.seller) if selectors.seller else urlparse(source_url).hostname or ""
    stock_status = _stock_status(stock_text)
    collected_timestamp = collected_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    hash_payload = {
        "product_name": product_name,
        "price": price,
        "image_url": image_url,
        "stock_status": stock_status,
        "seller": seller,
        "source_url": source_url,
    }
    raw_hash = sha256(
        json.dumps(hash_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return CollectedProductRecord(
        schema_version="1",
        product_name=product_name,
        price=price,
        image_url=image_url,
        stock_status=stock_status,
        seller=seller,
        collected_at=collected_timestamp,
        source_url=source_url,
        raw_hash=raw_hash,
    )


async def collect_public_products(
    urls: list[str],
    selectors: PublicProductSelectors,
    policy: CollectorAccessPolicy,
    staging_path: Path,
) -> list[CollectedProductRecord]:
    """Crawl only explicitly approved public/owned pages and append normalized JSONL."""
    try:
        from crawlee.crawlers import BeautifulSoupCrawler, BeautifulSoupCrawlingContext
        from crawlee.http_clients import ImpitHttpClient
    except ImportError as error:  # pragma: no cover - optional runtime dependency
        raise RuntimeError(
            "Crawlee collector dependencies are not installed; use requirements-collector.txt"
        ) from error

    approved_urls = [assert_allowed_source_url(url, policy) for url in urls]
    if not approved_urls:
        return []

    records: list[CollectedProductRecord] = []
    http_client = ImpitHttpClient(follow_redirects=False)
    crawler = BeautifulSoupCrawler(
        http_client=http_client,
        max_requests_per_crawl=len(approved_urls),
        max_request_retries=0,
        retry_on_blocked=False,
        respect_robots_txt_file=True,
    )

    @crawler.router.default_handler
    async def request_handler(context: BeautifulSoupCrawlingContext) -> None:
        source_url = resolve_loaded_source_url(
            context.request.url,
            context.request.loaded_url,
            policy,
        )
        record = collect_product_from_soup(context.soup, source_url, selectors)
        append_records_jsonl(staging_path, [record])
        records.append(record)

    await crawler.run(approved_urls)
    return records


def append_records_jsonl(path: Path, records: list[CollectedProductRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as output:
        for record in records:
            output.write(json.dumps(asdict(record), ensure_ascii=False, sort_keys=True) + "\n")


def assert_allowed_source_url(url: str, policy: CollectorAccessPolicy) -> str:
    if not policy.allowed_hosts:
        raise ValueError("collector policy requires at least one allowed host")
    if policy.authorization_basis not in {"public_page", "owned_channel"}:
        raise ValueError("collector authorization basis is invalid")
    parsed = urlparse(url.strip())
    hostname = (parsed.hostname or "").lower()
    allowed_hosts = {host.strip().lower() for host in policy.allowed_hosts if host.strip()}
    if parsed.scheme not in {"http", "https"} or not hostname:
        raise ValueError("collector source URL must use http/https")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("collector source URL must not contain embedded credentials")
    if hostname not in allowed_hosts:
        raise ValueError(f"collector source host is not allowed: {hostname}")
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", parsed.query, ""))


def resolve_loaded_source_url(
    request_url: str,
    loaded_url: str | None,
    policy: CollectorAccessPolicy,
) -> str:
    """Validate the final response URL so redirects cannot escape the allowlist."""
    return assert_allowed_source_url(loaded_url or request_url, policy)


def _select_text(soup: object, selector: str) -> str:
    if not selector:
        return ""
    node = soup.select_one(selector)  # type: ignore[attr-defined]
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def _select_image(soup: object, selector: str, source_url: str) -> str:
    if not selector:
        return ""
    node = soup.select_one(selector)  # type: ignore[attr-defined]
    if not node:
        return ""
    candidate = str(node.get("src") or node.get("data-src") or "").strip()
    return urljoin(source_url, candidate) if candidate else ""


def _parse_price(value: str) -> int | None:
    number_pattern = r"(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)"
    currency_match = re.search(
        rf"(?:₩|KRW)\s*(?P<prefix>{number_pattern})|(?P<suffix>{number_pattern})\s*원",
        value,
        re.IGNORECASE,
    )
    if currency_match:
        amount = currency_match.group("prefix") or currency_match.group("suffix")
    else:
        match = re.search(number_pattern, value)
        if not match:
            return None
        amount = match.group(0)
    if not amount:
        return None
    return int(amount.replace(",", ""))


def _stock_status(value: str) -> StockStatus:
    normalized = re.sub(r"\s+", "", value.casefold())
    if any(term in normalized for term in ("품절", "soldout", "outofstock", "재고없음")):
        return "out_of_stock"
    if any(term in normalized for term in ("재고", "구매가능", "instock", "available")):
        return "in_stock"
    return "unknown"
