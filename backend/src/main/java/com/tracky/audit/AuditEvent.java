package com.tracky.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/**
 * Um evento do trilho de auditoria. Só se insere; nunca se altera.
 *
 * {@code actor}, {@code kind}, {@code action} e {@code entityType} são String de propósito,
 * nunca {@code @Enumerated}: o Hibernate geraria um CHECK com os valores do enum que o
 * {@code ddl-auto: update} nunca atualiza, e uma ação nova falharia a inserção.
 */
@Entity
@Immutable
@Table(name = "audit_events", indexes = @Index(name = "idx_audit_events_user_id", columnList = "user_id, id"))
public class AuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant occurredAt;

    /** Nulo só num login com email desconhecido (e no registo recusado). */
    @Column(name = "user_id")
    private Long userId;

    /** USER (pedido HTTP) ou SYSTEM (scheduler). */
    @Column(nullable = false, length = 10)
    private String actor;

    @Column(nullable = false, length = 10)
    private String kind;

    @Column(nullable = false, length = 40)
    private String action;

    @Column(length = 30)
    private String entityType;

    private Long entityId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> details;

    @Column(length = 45)
    private String ip;

    @Column(length = 255)
    private String userAgent;

    @Column(length = 16)
    private String requestId;

    protected AuditEvent() {}

    AuditEvent(AuditRecord r) {
        this.occurredAt = r.occurredAt();
        this.userId = r.userId();
        this.actor = r.actor();
        this.kind = r.kind();
        this.action = r.action();
        this.entityType = r.entityType();
        this.entityId = r.entityId();
        this.details = r.details();
        this.ip = r.ip();
        this.userAgent = r.userAgent();
        this.requestId = r.requestId();
    }

    public Long getId() { return id; }
    public Instant getOccurredAt() { return occurredAt; }
    public Long getUserId() { return userId; }
    public String getActor() { return actor; }
    public String getKind() { return kind; }
    public String getAction() { return action; }
    public String getEntityType() { return entityType; }
    public Long getEntityId() { return entityId; }
    public Map<String, Object> getDetails() { return details; }
    public String getIp() { return ip; }
    public String getUserAgent() { return userAgent; }
    public String getRequestId() { return requestId; }
}
