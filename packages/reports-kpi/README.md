# Reports KPI truth

This package contains the versioned metric dictionary and a deterministic
fixture oracle for `P7-KPI-001`. Production reports must call the approved
`private.calculate_kpi` SQL function; this TypeScript implementation exists to
make hand-calculated fixtures executable and to prove the SQL contract has no
AI-derived numeric truth.

All periods use a half-open UTC instant range `[from, to)`. A tenant's display
timezone is metadata for presentation only. Rate metrics return `null` when
the denominator is zero; they never turn missing data into a misleading 0%.
The tenant's approved SLA snapshot supplies due times and approved pause
seconds. Real business-calendar and first-response policy activation remains
the OD-005 configuration boundary.
