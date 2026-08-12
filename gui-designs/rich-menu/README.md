# Rich Menu design assets

- `RM-01-main.svg`: production-oriented master, 2500×1686, five areas.
- `RM-01-main-tap-map.svg`: annotated coordinates; do not upload this overlay to LINE.
- `RM-02-services.svg`: service alias concept; labels/actions are tenant-configurable.

Before publish, render SVG to PNG, verify the output is no larger than 1 MB, validate all bounds, URLs, feature dependencies and phone-size readability. The builder must create a new LINE rich-menu object when the artwork changes and retain the last-known-good ID for rollback.
