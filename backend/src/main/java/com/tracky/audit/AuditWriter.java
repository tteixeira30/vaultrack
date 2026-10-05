package com.tracky.audit;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Grava os eventos de auditoria depois do commit da transação que os originou (ou logo,
 * se não houver transação). Um rollback não deixa evento.
 *
 * A gravação corre numa thread própria, numa transação nova. Fazê-la na thread do pedido
 * pedia uma segunda ligação ao pool enquanto a da transação original ainda está presa
 * (o AFTER_COMMIT corre antes de a libertar): com escritas concorrentes suficientes, o pool
 * esgotava-se à espera de si próprio. A fila é limitada; cheia, o evento perde-se com um
 * ERROR no log. Uma falha nunca chega ao pedido.
 *
 * Nos testes ({@code tracky.audit.async=false}) grava na própria thread, para se poder
 * verificar o evento logo a seguir ao pedido.
 */
@Component
public class AuditWriter {

    private static final Logger log = LoggerFactory.getLogger("tracky.audit");
    private static final int QUEUE = 1_000;

    private final AuditEventRepository repo;
    private final TransactionTemplate tx;
    private final Executor executor;

    @Autowired
    public AuditWriter(AuditEventRepository repo, PlatformTransactionManager txManager,
                       @Value("${tracky.audit.async:true}") boolean async) {
        this(repo, txManager, async ? newExecutor() : Runnable::run);
    }

    AuditWriter(AuditEventRepository repo, PlatformTransactionManager txManager, Executor executor) {
        this.repo = repo;
        this.tx = new TransactionTemplate(txManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.executor = executor;
    }

    private static ExecutorService newExecutor() {
        return new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(QUEUE), r -> {
            Thread t = new Thread(r, "audit-writer");
            t.setDaemon(true);
            return t;
        }, (r, ex) -> log.error("Fila da auditoria cheia: evento descartado"));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(AuditRecord r) {
        try {
            executor.execute(() -> write(r));
        } catch (RuntimeException e) {
            log.error("Falha a agendar o evento de auditoria {} {}", r.action(), r.entityType(), e);
        }
    }

    private void write(AuditRecord r) {
        try {
            tx.executeWithoutResult(s -> repo.save(new AuditEvent(r)));
            // só ids: o conteúdo (details) fica na BD, não nos logs
            log.info("{} {} {} user={}", r.action(), r.entityType() == null ? "-" : r.entityType(),
                    r.entityId() == null ? "-" : r.entityId(), r.userId() == null ? "-" : r.userId());
        } catch (RuntimeException e) {
            log.error("Falha a gravar o evento de auditoria {} {}", r.action(), r.entityType(), e);
        }
    }

    /** No fim, dá uns segundos à fila para gravar o que falta. */
    @PreDestroy
    void shutdown() throws InterruptedException {
        if (executor instanceof ExecutorService es) {
            es.shutdown();
            es.awaitTermination(5, TimeUnit.SECONDS);
        }
    }
}
