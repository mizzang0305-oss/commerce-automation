# Video Renderer Fixtures

The smoke command generates 1-image, 3-image, and 6-image color fixtures under the ignored `artifacts/video-use-comparison/` directory. It does not download products or use live affiliate data.

Invalid-image, duplicate-hash, timeout/fallback, mode, and no-publish behavior are covered by `tests/video-use-renderer-migration.test.ts`.
