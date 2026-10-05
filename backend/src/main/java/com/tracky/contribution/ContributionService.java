package com.tracky.contribution;

import com.tracky.audit.AuditAction;
import com.tracky.audit.AuditService;
import com.tracky.goal.Goal;
import com.tracky.goal.GoalRepository;
import com.tracky.investment.Investment;
import com.tracky.investment.InvestmentRepository;
import com.tracky.investment.PriceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Aplica os depósitos mensais automáticos a objetivos e investimentos.
 * Modo calendário: aplica os meses em atraso desde o último aplicado (catch-up,
 * porque a app corre localmente e pode estar desligada no dia do reforço).
 * O mês corrente só é aplicado a partir do dia configurado ({@code contributionDay},
 * clampado ao comprimento do mês); meses inteiros em atraso aplicam-se na íntegra
 * independentemente do dia. Mudar o dia nunca reaplica nem desfaz meses já aplicados —
 * é o {@code lastAppliedMonth} que manda.
 * Modo forçado (botão "Simular"): aplica exatamente um mês e avança o marcador,
 * para o scheduler não voltar a aplicar o mesmo mês.
 */
@Service
public class ContributionService {

    private static final Logger log = LoggerFactory.getLogger(ContributionService.class);

    private final GoalRepository goalRepository;
    private final InvestmentRepository investmentRepository;
    private final PriceService priceService;
    private final Clock clock;

    @Autowired
    public ContributionService(GoalRepository goalRepository, InvestmentRepository investmentRepository,
                               PriceService priceService) {
        this(goalRepository, investmentRepository, priceService, Clock.systemDefaultZone());
    }

    /** Visível para testes — permite fixar a data "de hoje". */
    ContributionService(GoalRepository goalRepository, InvestmentRepository investmentRepository,
                        PriceService priceService, Clock clock) {
        this.goalRepository = goalRepository;
        this.investmentRepository = investmentRepository;
        this.priceService = priceService;
        this.clock = clock;
    }

    private AuditService audit = AuditService.NOOP;

    @Autowired
    void setAudit(AuditService audit) {
        this.audit = audit;
    }

    public record AppliedItem(String type, String name, int months, BigDecimal amount) {}
    public record ApplyResult(List<AppliedItem> applied, BigDecimal totalAmount) {}

    @Transactional
    public ApplyResult apply(Long userId, String scope, boolean force) {
        List<AppliedItem> applied = new ArrayList<>();

        if (!"investments".equals(scope)) {
            for (Goal goal : goalRepository.findByUserIdOrderByIdAsc(userId)) {
                if (!goal.isAutoDeposit() || goal.getMonthlyAllocation() == null
                        || goal.getMonthlyAllocation().signum() <= 0) continue;
                int months = monthsToApply(goal.getLastAppliedMonth(), force, goal.getContributionDay());
                if (months <= 0) continue;
                BigDecimal amount = goal.getMonthlyAllocation().multiply(BigDecimal.valueOf(months));
                // não ultrapassar o alvo: capa o depósito ao que falta (0 se já concluído)
                if (goal.getTargetAmount() != null) {
                    BigDecimal saved = goal.getSavedAmount() == null ? BigDecimal.ZERO : goal.getSavedAmount();
                    BigDecimal remaining = goal.getTargetAmount().subtract(saved).max(BigDecimal.ZERO);
                    amount = amount.min(remaining);
                }
                String oldMonth = goal.getLastAppliedMonth();
                String newMonth = advance(oldMonth, months);
                // avanço atómico e condicional do marcador — evita dupla aplicação se
                // o scheduler e um pedido concorrente correrem sobre a mesma linha
                int updated = goalRepository.applyAutoDeposit(goal.getId(), amount, oldMonth, newMonth);
                if (updated > 0 && amount.signum() > 0) {
                    applied.add(new AppliedItem("goal", goal.getName(), months, amount));
                }
            }
        }

        if (!"goals".equals(scope)) {
            for (Investment inv : investmentRepository.findByUserIdOrderByIdAsc(userId)) {
                if (inv.getMonthlyContribution() == null || inv.getMonthlyContribution().signum() <= 0) continue;
                int months = monthsToApply(inv.getLastAppliedMonth(), force, inv.getContributionDay());
                if (months <= 0) continue;
                BigDecimal amount = inv.getMonthlyContribution().multiply(BigDecimal.valueOf(months));
                String oldMonth = inv.getLastAppliedMonth();
                String newMonth = advance(oldMonth, months);

                int updated;
                if (inv.getQuantity() != null && inv.getSymbol() != null) {
                    // compra de unidades ao preço atual; sem preço disponível fica pendente e tenta na próxima
                    Optional<BigDecimal> price = priceService.getPriceEur(inv.getSymbol(), inv.getType());
                    if (price.isEmpty() || price.get().signum() <= 0) {
                        log.warn("Reforço de {} adiado: sem preço para {}", inv.getName(), inv.getSymbol());
                        continue;
                    }
                    BigDecimal units = amount.divide(price.get(), 8, RoundingMode.HALF_UP);
                    updated = investmentRepository.applyReinforcementUnits(inv.getId(), units, amount, oldMonth, newMonth);
                } else {
                    updated = investmentRepository.applyReinforcementValue(inv.getId(), amount, oldMonth, newMonth);
                }
                if (updated > 0) {
                    applied.add(new AppliedItem("investment", inv.getName(), months, amount));
                }
            }
        }

        BigDecimal total = applied.stream().map(AppliedItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        if (!applied.isEmpty()) {
            // ator SYSTEM no scheduler, USER no "Simular" (o AuditService vê se há pedido HTTP)
            audit.record(userId, AuditAction.CONTRIBUTIONS_APPLIED, null, null, AuditService.fields(
                    "total", total, "forced", force,
                    "items", applied.stream().map(i -> AuditService.fields(
                            "type", i.type(), "name", i.name(), "months", i.months(), "amount", i.amount())).toList()));
        }
        return new ApplyResult(applied, total);
    }

    private int monthsToApply(String lastAppliedMonth, boolean force, int contributionDay) {
        if (force) return 1;
        if (lastAppliedMonth == null) return 0;
        LocalDate today = LocalDate.now(clock);
        long pending = ChronoUnit.MONTHS.between(YearMonth.parse(lastAppliedMonth), YearMonth.from(today));
        // o mês corrente só conta a partir do dia configurado (dia 31 num mês de 30 → aplica no dia 30);
        // os meses inteiros em atraso aplicam-se sempre, independentemente do dia
        if (pending > 0 && today.getDayOfMonth() < Math.min(contributionDay, today.lengthOfMonth())) pending--;
        return (int) Math.max(0, pending);
    }

    private String advance(String lastAppliedMonth, int months) {
        YearMonth base = lastAppliedMonth == null ? YearMonth.now(clock) : YearMonth.parse(lastAppliedMonth);
        return base.plusMonths(months).toString();
    }
}
