package com.tracky.audit;

/** O que aconteceu. A coluna guarda o nome (String) — ver {@link AuditEvent}. */
public enum AuditAction {
    REGISTERED(Kind.SECURITY),
    LOGIN_SUCCEEDED(Kind.SECURITY),
    LOGIN_FAILED(Kind.SECURITY),
    RATE_LIMITED(Kind.SECURITY),
    INVITE_REJECTED(Kind.SECURITY),

    CREATED(Kind.DATA),
    UPDATED(Kind.DATA),
    DELETED(Kind.DATA),
    /** Reforço manual de um objetivo. */
    CONTRIBUTED(Kind.DATA),
    /** Um evento por extrato importado. */
    IMPORTED(Kind.DATA),
    /** Reforços/depósitos mensais aplicados (scheduler ou "Simular"). */
    CONTRIBUTIONS_APPLIED(Kind.DATA);

    public enum Kind { SECURITY, DATA }

    private final Kind kind;

    AuditAction(Kind kind) {
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
