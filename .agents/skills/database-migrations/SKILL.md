---
name: database-migrations
description: "Plan and execute database schema migrations safely. Use when adding tables, modifying columns, creating indexes, or performing data migrations. Triggers: database migration, schema change, add column, create table, alter table, data migration."
---

# Database Migrations

Plan and execute database schema changes safely with rollback strategies.

## When to Use

- Adding or modifying database tables/columns
- Creating or dropping indexes
- Migrating data between schemas
- Planning database refactoring

## Migration Safety Checklist

### Before Writing
- [ ] Understand current schema state
- [ ] Check for data that would be affected
- [ ] Plan rollback strategy
- [ ] Consider impact on running application

### Writing Migrations
- [ ] One logical change per migration
- [ ] Include both up and down migrations
- [ ] Use transactions where supported
- [ ] Handle existing data appropriately
- [ ] Test with production-like data volume

### Deployment
- [ ] Run on staging first
- [ ] Backup database before production run
- [ ] Monitor for lock contention
- [ ] Verify rollback procedure works

## Safe Migration Patterns

### Adding a Column
```sql
-- Safe: nullable column with default
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- Unsafe: non-nullable without default on existing table
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL; -- FAILS if rows exist
```

### Renaming a Column (Zero-Downtime)
1. Add new column
2. Backfill data from old column
3. Update application to write to both columns
4. Deploy application reading from new column
5. Stop writing to old column
6. Drop old column

### Adding an Index
```sql
-- Safe: concurrent index creation (PostgreSQL)
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);

-- Unsafe: blocks writes during creation
CREATE INDEX idx_users_email ON users(email);
```

### Data Migrations
- Separate schema migrations from data migrations
- Process data in batches (1000-10000 rows)
- Log progress for long-running migrations
- Make data migrations idempotent

## Common Pitfalls

- Dropping columns that running code still references
- Long-running migrations that lock tables
- Missing indexes on foreign keys
- Not testing rollback procedures
- Assuming empty tables in migration logic
