import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.collectors.toss_link_importer import load_candidates_from_table
from src.collectors.crawlee_public_product_collector import (
    CollectorAccessPolicy,
    PublicProductSelectors,
    append_records_jsonl,
    assert_allowed_source_url,
    collect_product_from_html,
    resolve_loaded_source_url,
)


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

    def test_crawlee_fixture_extracts_normalized_staging_record(self):
        fixture = Path(__file__).parent / "fixtures" / "public_product_page.html"
        record = collect_product_from_html(
            fixture.read_text(encoding="utf-8"),
            "https://shop.example/products/organizer?campaign=poc#details",
            _fixture_selectors(),
            CollectorAccessPolicy(
                allowed_hosts=("shop.example",),
                authorization_basis="public_page",
            ),
            collected_at="2026-07-20T10:00:00Z",
        )

        self.assertEqual(record.product_name, "휴대용 정리함")
        self.assertEqual(record.price, 12900)
        self.assertEqual(record.image_url, "https://shop.example/images/organizer.jpg")
        self.assertEqual(record.stock_status, "in_stock")
        self.assertEqual(record.seller, "Example Store")
        self.assertEqual(record.source_url, "https://shop.example/products/organizer?campaign=poc")
        self.assertRegex(record.raw_hash, r"^[0-9a-f]{64}$")

    def test_crawlee_fixture_appends_jsonl_staging_record(self):
        fixture = Path(__file__).parent / "fixtures" / "public_product_page.html"
        record = collect_product_from_html(
            fixture.read_text(encoding="utf-8"),
            "https://shop.example/products/organizer",
            _fixture_selectors(),
            CollectorAccessPolicy(("shop.example",), "owned_channel"),
            collected_at="2026-07-20T10:00:00Z",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "staging" / "products.jsonl"
            append_records_jsonl(output, [record])
            saved = output.read_text(encoding="utf-8").splitlines()

        self.assertEqual(len(saved), 1)
        self.assertIn('"raw_hash"', saved[0])
        self.assertNotIn('"publish"', saved[0])

    def test_crawlee_collector_parses_only_the_first_price_amount(self):
        record = collect_product_from_html(
            """
            <main>
              <h1 class="name">할인 상품</h1>
              <p class="price">10% 할인 12,900원</p>
              <img class="image" src="/product.jpg" />
              <p class="stock">재고 있음</p>
            </main>
            """,
            "https://shop.example/products/discounted",
            PublicProductSelectors(".name", ".price", ".image", ".stock"),
            CollectorAccessPolicy(("shop.example",), "public_page"),
            collected_at="2026-07-20T10:00:00Z",
        )

        self.assertEqual(record.price, 12900)

    def test_crawlee_collector_recognizes_spaced_korean_out_of_stock_text(self):
        record = collect_product_from_html(
            """
            <main>
              <h1 class="name">품절 상품</h1>
              <p class="price">12,900원</p>
              <img class="image" src="/product.jpg" />
              <p class="stock">재고 없음</p>
            </main>
            """,
            "https://shop.example/products/sold-out",
            PublicProductSelectors(".name", ".price", ".image", ".stock"),
            CollectorAccessPolicy(("shop.example",), "public_page"),
            collected_at="2026-07-20T10:00:00Z",
        )

        self.assertEqual(record.stock_status, "out_of_stock")

    def test_crawlee_collector_rejects_unapproved_hosts(self):
        fixture = Path(__file__).parent / "fixtures" / "public_product_page.html"
        with self.assertRaisesRegex(ValueError, "not allowed"):
            collect_product_from_html(
                fixture.read_text(encoding="utf-8"),
                "https://unapproved.example/products/1",
                _fixture_selectors(),
                CollectorAccessPolicy(("shop.example",), "public_page"),
            )

    def test_crawlee_collector_rejects_redirects_outside_allowlist(self):
        policy = CollectorAccessPolicy(("shop.example",), "public_page")
        with self.assertRaisesRegex(ValueError, "not allowed"):
            resolve_loaded_source_url(
                "https://shop.example/redirect",
                "https://tracking.example/products/1",
                policy,
            )

    def test_crawlee_collector_rejects_embedded_credentials(self):
        policy = CollectorAccessPolicy(("shop.example",), "owned_channel")
        with self.assertRaisesRegex(ValueError, "embedded credentials"):
            assert_allowed_source_url("https://user:secret@shop.example/products/1", policy)


def _fixture_selectors() -> PublicProductSelectors:
    return PublicProductSelectors(
        product_name="[data-product-name]",
        price="[data-price]",
        image="[data-product-image]",
        stock="[data-stock]",
        seller="[data-seller]",
    )


if __name__ == "__main__":
    unittest.main()
