# Quotes Service Context

## Purpose
Provide quotes for landing page carousel.

## Storage
Table: quotes
Fields:
- text
- author
- source
- is_active
- sort_order

## Public API
GET /api/public/quotes?limit=&order=random|sort_order

## Admin
- Full CRUD (ADMIN only)
- Meta-driven form