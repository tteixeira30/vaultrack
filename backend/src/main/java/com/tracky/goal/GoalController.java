package com.tracky.goal;

import com.tracky.audit.AuditAction;
import com.tracky.audit.AuditEntity;
import com.tracky.audit.AuditService;
import org.springframework.beans.factory.annotation.Autowired;
import com.tracky.auth.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/goals")
public class GoalController {

    private final GoalRepository repo;

    public GoalController(GoalRepository repo) {
        this.repo = repo;
    }

    private AuditService audit = AuditService.NOOP;

    @Autowired
    void setAudit(AuditService audit) {
        this.audit = audit;
    }

    public record GoalRequest(@NotBlank @Size(max = 100, message = "O nome não pode ter mais de 100 caracteres.") String name, @NotNull(message = "Indica o valor do objetivo.") @Positive(message = "O valor do objetivo tem de ser maior que 0.") BigDecimal targetAmount,
                              @NotNull(message = "Indica a contribuição mensal.") @Positive(message = "A contribuição mensal tem de ser maior que 0.") BigDecimal monthlyAllocation, BigDecimal savedAmount,
                              Boolean autoDeposit, Integer contributionDay) {}
    public record ContributionRequest(@NotNull BigDecimal amount) {}
    public record GoalDto(Long id, String name, BigDecimal targetAmount, BigDecimal monthlyAllocation,
                          BigDecimal savedAmount, BigDecimal progressPercent, Integer monthsRemaining,
                          LocalDate estimatedDate, boolean autoDeposit, int contributionDay) {}

    @GetMapping
    public List<GoalDto> list(@AuthenticationPrincipal User user) {
        return repo.findByUserIdOrderByIdAsc(user.getId()).stream().map(this::toDto).toList();
    }

    @PostMapping
    public GoalDto create(@AuthenticationPrincipal User user, @Valid @RequestBody GoalRequest req) {
        Goal g = new Goal();
        g.setUserId(user.getId());
        apply(g, req);
        g = repo.save(g);
        audit.created(user.getId(), AuditEntity.GOAL, g.getId(), g.getName(), auditFields(g));
        return toDto(g);
    }

    @PutMapping("/{id}")
    public GoalDto update(@AuthenticationPrincipal User user, @PathVariable Long id,
                          @Valid @RequestBody GoalRequest req) {
        Goal g = require(user, id);
        var before = auditFields(g);
        apply(g, req);
        g = repo.save(g);
        audit.updated(user.getId(), AuditEntity.GOAL, g.getId(), g.getName(), before, auditFields(g));
        return toDto(g);
    }

    @PostMapping("/{id}/contribute")
    @Transactional
    public GoalDto contribute(@AuthenticationPrincipal User user, @PathVariable Long id,
                              @Valid @RequestBody ContributionRequest req) {
        // valida posse (404 se não for do utilizador) e incrementa atomicamente, sem
        // read-modify-write — dois depósitos concorrentes ao mesmo objetivo não se perdem
        require(user, id);
        repo.addToSavedAmount(id, user.getId(), req.amount());
        Goal g = require(user, id);
        audit.record(user.getId(), AuditAction.CONTRIBUTED, AuditEntity.GOAL, id,
                AuditService.fields("label", g.getName(), "amount", req.amount(), "savedAmount", g.getSavedAmount()));
        return toDto(g);
    }

    @DeleteMapping("/{id}")
    public void delete(@AuthenticationPrincipal User user, @PathVariable Long id) {
        repo.findByIdAndUserId(id, user.getId()).ifPresent(g -> {
            repo.delete(g);
            audit.deleted(user.getId(), AuditEntity.GOAL, g.getId(), g.getName(), auditFields(g));
        });
    }

    /** Os campos que a auditoria regista (antes/depois). Montantes em EUR. */
    private static Map<String, Object> auditFields(Goal g) {
        return AuditService.fields("name", g.getName(), "targetAmount", g.getTargetAmount(),
                "monthlyAllocation", g.getMonthlyAllocation(), "savedAmount", g.getSavedAmount(),
                "autoDeposit", g.isAutoDeposit(), "contributionDay", g.getContributionDay());
    }

    /** O objetivo do utilizador, ou 404 — também quando existe mas é de outro utilizador. */
    private Goal require(User user, Long id) {
        return repo.findByIdAndUserId(id, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objetivo não encontrado."));
    }

    private void apply(Goal g, GoalRequest req) {
        if (req.contributionDay() != null && (req.contributionDay() < 1 || req.contributionDay() > 31)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica um dia do mês entre 1 e 31.");
        }
        g.setName(req.name());
        g.setTargetAmount(req.targetAmount());
        g.setMonthlyAllocation(req.monthlyAllocation());
        if (req.savedAmount() != null) g.setSavedAmount(req.savedAmount());
        boolean auto = Boolean.TRUE.equals(req.autoDeposit());
        // ao ativar, marca o mês atual como já aplicado — o primeiro depósito automático é no próximo mês
        if (auto && !g.isAutoDeposit()) g.setLastAppliedMonth(YearMonth.now().toString());
        g.setAutoDeposit(auto);
        // mudar o dia não toca no lastAppliedMonth — meses já aplicados nunca se repetem nem se desfazem
        g.setContributionDay(req.contributionDay());
    }

    private GoalDto toDto(Goal g) {
        BigDecimal remaining = g.getTargetAmount().subtract(g.getSavedAmount());
        BigDecimal progress = g.getTargetAmount().signum() == 0 ? BigDecimal.ZERO
                : g.getSavedAmount().multiply(BigDecimal.valueOf(100))
                    .divide(g.getTargetAmount(), 1, RoundingMode.HALF_UP)
                    .min(BigDecimal.valueOf(100));
        Integer months = null;
        LocalDate estimated = null;
        if (remaining.signum() <= 0) {
            months = 0;
        } else if (g.getMonthlyAllocation() != null && g.getMonthlyAllocation().signum() > 0) {
            months = remaining.divide(g.getMonthlyAllocation(), 0, RoundingMode.CEILING).intValue();
            estimated = LocalDate.now().plusMonths(months);
        }
        return new GoalDto(g.getId(), g.getName(), g.getTargetAmount(), g.getMonthlyAllocation(),
                g.getSavedAmount(), progress, months, estimated, g.isAutoDeposit(), g.getContributionDay());
    }
}
