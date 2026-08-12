# Rich Menu lifecycle package

`@citychatbot/rich-menu` owns the tenant-scoped Rich Menu draft/validation/publish/rollback contract. It validates the locked 2500×1686 default geometry, private asset metadata, action URL allowlists, feature dependencies, state transitions, optimistic versions, idempotency and last-known-good rollback.

The `LineRichMenuProvider` boundary is deliberately explicit. The in-memory provider is a deterministic test/local adapter; production LINE credentials and the durable worker remain deployment configuration. No image bytes, provider token or citizen identity is stored by this package.
