package com.tracky.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Grava os eventos de auditoria depois do commit da transação que os originou (ou logo,
 * se não houver transação). Um rollback não deixa evento.
 *
 * A gravação corre numa transação nova ({@code REQUIRES_NEW}: a original já terminou) e
 * a chamada inteira fica dentro do try/catch, para apanhar também os erros no commit.
 * Uma falha fica no log e o pedido segue.
 */
@Component
public class AuditWriter {

    private static final Logger log = LoggerFactory.getLogger("tracky.audit");

    private final AuditEventRepository repo;
    private final TransactionTemplate tx;

    public AuditWriter(AuditEventRepository repo, PlatformTransactionManager txManager) {
        this.repo = repo;
        this.tx = new TransactionTemplate(txManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(AuditRecord r) {
        try {
            tx.executeWithoutResult(s -> repo.save(new AuditEvent(r)));
            // só ids: o conteúdo (details) fica na BD, não nos logs
            log.info("{} {} {} user={}", r.action(), r.entityType() == null ? "-" : r.entityType(),
                    r.entityId() == null ? "-" : r.entityId(), r.userId() == null ? "-" : r.userId());
        } catch (RuntimeException e) {
            log.error("Falha a gravar o evento de auditoria {} {}", r.action(), r.entityType(), e);
        }
    }
}
