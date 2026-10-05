package com.tracky.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Apaga os eventos de auditoria mais antigos do que {@code tracky.audit.retention-days}
 * (365 por omissão; 0 = não apagar). Os IPs são dados pessoais: não se guardam para sempre.
 */
@Component
public class AuditRetentionScheduler {

    private static final Logger log = LoggerFactory.getLogger(AuditRetentionScheduler.class);

    private final AuditEventRepository repo;
    private final int retentionDays;
    private final Clock clock;

    @Autowired
    public AuditRetentionScheduler(AuditEventRepository repo,
                                   @Value("${tracky.audit.retention-days:365}") int retentionDays) {
        this(repo, retentionDays, Clock.systemUTC());
    }

    /** Visível para testes — permite fixar a data "de hoje". */
    AuditRetentionScheduler(AuditEventRepository repo, int retentionDays, Clock clock) {
        this.repo = repo;
        this.retentionDays = retentionDays;
        this.clock = clock;
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void purge() {
        if (retentionDays <= 0) return;
        Instant cutoff = Instant.now(clock).minus(Duration.ofDays(retentionDays));
        int deleted = repo.deleteOlderThan(cutoff);
        if (deleted > 0) log.info("Auditoria: {} eventos anteriores a {} apagados", deleted, cutoff);
    }
}
