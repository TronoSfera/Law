# Universal Query Engine Context

## Purpose
Provide filtering/sorting/pagination for all admin tables.

## Operators
=  !=  >  <  >=  <=  ~ (ilike)

## Schema
UniversalQuery:
- filters[]
- sort[]
- page{limit,offset}

## Used In
- requests
- quotes
- topics
- statuses
- form_fields