import { expect, test } from "vitest";
import { extractStructuredProductImages, readExactProductPageImages } from "@/lib/simple-producer/exactProductImages";

const productId = "coupang:product:111:item:222:vendor:333";
const productUrl = "https://www.coupang.com/vp/products/111?itemId=222&vendorItemId=333";
const html = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Product", url: productUrl,
  image: [
    "https://image.coupangcdn.com/a.jpg",
    "https://image.coupangcdn.com/b.jpg",
    "https://image.coupangcdn.com/b.jpg",
    "https://thumbnail.coupangcdn.com/c.jpg",
    "https://other.example.com/wrong.jpg"
  ]
})}</script>`;

test("extracts only distinct trusted CDN images from the exact structured Product", () => {
  expect(extractStructuredProductImages(html, productUrl)).toEqual([
    "https://image.coupangcdn.com/a.jpg", "https://image.coupangcdn.com/b.jpg", "https://thumbnail.coupangcdn.com/c.jpg"
  ]);
  expect(extractStructuredProductImages(html, "https://www.coupang.com/vp/products/999?itemId=222&vendorItemId=333")).toEqual([]);
});

test("rejects a redirected option before reading its structured images", async () => {
  const fetchImpl = async () => ({ ok: true, url: "https://www.coupang.com/vp/products/111?itemId=444&vendorItemId=333",
    headers: new Headers({ "content-type": "text/html" }), text: async () => html }) as Response;
  await expect(readExactProductPageImages({ rawProductUrl: productUrl, productId, fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual([]);
});

test("accepts structured images only when the response retains product and option binding", async () => {
  let redirect = "";
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    redirect = init?.redirect ?? "";
    return { ok: true, url: productUrl, headers: new Headers({ "content-type": "text/html" }),
      text: async () => html } as Response;
  };
  await expect(readExactProductPageImages({ rawProductUrl: productUrl, productId, fetchImpl: fetchImpl as typeof fetch })).resolves.toHaveLength(3);
  expect(redirect).toBe("manual");
});
