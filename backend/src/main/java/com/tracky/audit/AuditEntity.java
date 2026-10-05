package com.tracky.audit;

/** Tipo da entidade afetada. A coluna guarda o nome (String) — ver {@link AuditEvent}. */
public enum AuditEntity {
    USER, GOAL, INVESTMENT, ACCOUNT, TRANSACTION, CATEGORY, CATEGORY_RULE,
    INCOME, ALLOCATION, ALLOCATION_ITEM, CALENDAR_EVENT
}
