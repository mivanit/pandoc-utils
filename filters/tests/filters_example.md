---
title: test
__pandoc__:
  filters:
    - $FILTERS$/csv_tex_table.py
    # - $FILTERS$/table.lua
---

```{.csvtable caption="Error Table"}
m,t1,t2,error
10,0.0,0.0,9.46949e-17
100,0.438,0.0,5.90354e-16
1000,3.75,0.0,1.47807e-15
10000,39.9,0.0,8.26601e-16
```


## Vertical Table

```{.table #roles}
series:
- title: No.
  special: number
  align: right
- title: Role
  id: role
- title: Responsibility
  id: resp
data:
- role: Developer
  resp: |
    * Produce *quality* `code`
    * Meet deadlines
- role: Manager
  resp: |
    * Coordinate developers
    * Produce accurate reports
```

* Row numbers are generated.
* Generated table inherits block classes and ID for styling and referencing.


## Horizontal Tables

```{.table .horizontal #measurements}
orientation: horizontal
caption: Measurements
series:
- title: "Current, mA"
  id: i
- title: "Voltage, V"
  id: v
data:
- i: 15
  v: 3,0
- i: 16
  v: 3,1
- i: 15
  v: 3,1
- i: 16
  v: 3,0
```

```{.table #tbl:john}
template: card
caption: Employee 1
data:
- name: John Doe
  age: 32
  company: Acme Inc.
  position: Senior Software Developer
```

```{.table #tbl:jane}
template: card
caption: Employee 2
data:
- name: Jane Doe
  age: 29
  company: Acme Inc.
  position: Project Manager
```

* ID is preserved for tables -@tbl:john and -@tbl:jane for `pandoc-crossref`.
* Header cells are TD´s styled with CSS `:first-child`.
* Row alignment has to be defined with styles.
* Table template (headings, alignment, etc.) reused from document metadata.
* Table templates can add classes to generated tables.