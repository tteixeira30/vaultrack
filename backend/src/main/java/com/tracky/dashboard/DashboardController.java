package com.tracky.dashboard;

import com.tracky.auth.User;
import com.tracky.expense.ExpenseController;
import com.tracky.goal.Goal;
import com.tracky.goal.GoalController;
import com.tracky.goal.GoalRepository;
import com.tracky.income.IncomeController;
import com.tracky.investment.Investment;
import com.tracky.investment.InvestmentController;
import com.tracky.investment.InvestmentRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Visão geral agregada das finanças do utilizador. Reutiliza a lógica dos
 * controllers de rendimento, investimentos e objetivos — não duplica cálculos.
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final IncomeController incomeController;
    private final InvestmentController investmentController;
    private final GoalController goalController;
    private final ExpenseController expenseController;
    private final InvestmentRepository investmentRepo;
    private final GoalRepository goalRepo;

    public DashboardController(IncomeController incomeController, InvestmentController investmentController,
                              GoalController goalController, ExpenseController expenseController,
                              InvestmentRepository investmentRepo, GoalRepository goalRepo) {
        this.incomeController = incomeController;
        this.investmentController = investmentController;
        this.goalController = goalController;
        this.expenseController = expenseController;
        this.investmentRepo = investmentRepo;
        this.goalRepo = goalRepo;
    }

    public record Activity(String type, String title, String subtitle, Instant at) {}
    public record Insight(String kind, String icon, String title, String detail) {}
    public record DashboardResponse(
            BigDecimal netWorth,
            String incomeMonth,
            BigDecimal monthlyIncome,
            BigDecimal unallocated,
            BigDecimal totalInvested,
            BigDecimal totalInvestedCost,
            BigDecimal investmentGain,
            BigDecimal investmentGainPercent,
            BigDecimal totalSaved,
            BigDecimal totalGoalsTarget,
            BigDecimal goalsProgressPercent,
            int goalsCount,
            int goalsCompleted,
            List<InvestmentController.PortfolioPoint> evolution,
            ExpenseController.ExpenseStats expenses,
            List<Activity> recentActivity,
            List<Insight> insights) {}

    @GetMapping
    public DashboardResponse get(@AuthenticationPrincipal User user) {
        IncomeController.IncomeResponse income = incomeController.get(user, null);
        InvestmentController.PortfolioResponse portfolio = investmentController.list(user);
        List<GoalController.GoalDto> goals = goalController.list(user);
        ExpenseController.ExpenseStats expenses = expenseController.stats(user);

        InvestmentController.Summary inv = portfolio.summary();

        BigDecimal totalSaved = goals.stream()
                .map(GoalController.GoalDto::savedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalTarget = goals.stream()
                .map(GoalController.GoalDto::targetAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal goalsProgress = totalTarget.signum() == 0 ? BigDecimal.ZERO
                : totalSaved.multiply(HUNDRED).divide(totalTarget, 1, RoundingMode.HALF_UP).min(HUNDRED);
        int completed = (int) goals.stream()
                .filter(g -> g.progressPercent() != null && g.progressPercent().compareTo(HUNDRED) >= 0)
                .count();

        BigDecimal netWorth = inv.totalCurrent().add(totalSaved);

        // Evolução do património: histórico do portefólio deslocado pelo total
        // poupado atual. Vem um ano porque o herói do painel tem quatro janelas
        // (1M · 3M · 6M · 1A) e é o frontend que corta a série a cada uma.
        List<InvestmentController.PortfolioPoint> evolution = new ArrayList<>();
        for (InvestmentController.PortfolioPoint p : investmentController.history(user, "1y")) {
            evolution.add(new InvestmentController.PortfolioPoint(p.date(),
                    p.value().add(totalSaved).setScale(2, RoundingMode.HALF_UP)));
        }

        return new DashboardResponse(
                netWorth.setScale(2, RoundingMode.HALF_UP),
                income.month(),
                income.monthlyIncome(),
                income.unallocated(),
                inv.totalCurrent(),
                inv.totalInvested(),
                inv.totalGain(),
                inv.totalGainPercent(),
                totalSaved.setScale(2, RoundingMode.HALF_UP),
                totalTarget.setScale(2, RoundingMode.HALF_UP),
                goalsProgress,
                goals.size(),
                completed,
                evolution,
                expenses,
                recentActivity(user),
                insights(user, income, inv, goals, expenses));
    }

    /** Atividade recente a partir das datas de criação de investimentos e objetivos. */
    private List<Activity> recentActivity(User user) {
        List<Activity> activity = new ArrayList<>();
        for (Investment i : investmentRepo.findByUserIdOrderByIdAsc(user.getId())) {
            activity.add(new Activity("investment", i.getName(), "Investimento adicionado", i.getCreatedAt()));
        }
        for (Goal g : goalRepo.findByUserIdOrderByIdAsc(user.getId())) {
            activity.add(new Activity("goal", g.getName(), "Objetivo criado", g.getCreatedAt()));
        }
        return activity.stream()
                .filter(a -> a.at() != null)
                .sorted(Comparator.comparing(Activity::at).reversed())
                .limit(6)
                .toList();
    }

    private List<Insight> insights(User user, IncomeController.IncomeResponse income,
                                   InvestmentController.Summary inv, List<GoalController.GoalDto> goals,
                                   ExpenseController.ExpenseStats expenses) {
        List<Insight> out = new ArrayList<>();

        // despesas do mês vs mês anterior (só quando há histórico para comparar)
        BigDecimal spent = expenses.currentMonthOutflows(), prevSpent = expenses.prevMonthOutflows();
        if (spent != null && prevSpent != null && prevSpent.signum() > 0) {
            BigDecimal diff = spent.subtract(prevSpent);
            BigDecimal pct = diff.abs().multiply(HUNDRED).divide(prevSpent, 0, RoundingMode.HALF_UP);
            if (diff.signum() > 0) {
                out.add(new Insight("warning", "trending",
                        "Despesas a subir",
                        "Este mês já gastaste mais " + fmtEur(diff) + " (+" + pct + "%) que no mês anterior."));
            } else if (diff.signum() < 0) {
                out.add(new Insight("positive", "trending",
                        "Despesas a descer",
                        "Este mês gastaste menos " + fmtEur(diff.abs()) + " (−" + pct + "%) que no mês anterior."));
            }
        }

        // desempenho do portefólio
        if (inv.totalInvested().signum() > 0) {
            BigDecimal pct = inv.totalGainPercent();
            if (pct.signum() > 0) {
                out.add(new Insight("positive", "trending",
                        "Portefólio a valorizar",
                        "Os teus investimentos estão " + fmtPct(pct) + " acima do investido."));
            } else if (pct.signum() < 0) {
                out.add(new Insight("warning", "trending",
                        "Portefólio em queda",
                        "Os teus investimentos estão " + fmtPct(pct) + " face ao investido."));
            }
        }

        // objetivos quase concluídos
        goals.stream()
                .filter(g -> g.progressPercent() != null
                        && g.progressPercent().compareTo(BigDecimal.valueOf(80)) >= 0
                        && g.progressPercent().compareTo(HUNDRED) < 0)
                .findFirst()
                .ifPresent(g -> out.add(new Insight("info", "target",
                        "Objetivo quase concluído",
                        "\"" + g.name() + "\" está a " + g.progressPercent() + "% — quase lá!")));

        // objetivos concluídos
        long done = goals.stream()
                .filter(g -> g.progressPercent() != null && g.progressPercent().compareTo(HUNDRED) >= 0)
                .count();
        if (done > 0) {
            out.add(new Insight("positive", "check",
                    done == 1 ? "Objetivo alcançado" : done + " objetivos alcançados",
                    "Parabéns por " + (done == 1 ? "atingires um objetivo" : "atingires " + done + " objetivos") + "!"));
        }

        // comparação de rendimento com o mês anterior
        String current = YearMonth.now().toString();
        String previous = income.availableMonths().stream()
                .filter(m -> m.compareTo(current) < 0)
                .reduce((a, b) -> b)
                .orElse(null);
        if (previous != null) {
            BigDecimal prevIncome = incomeController.get(user, previous).monthlyIncome();
            BigDecimal diff = income.monthlyIncome().subtract(prevIncome);
            if (diff.signum() > 0) {
                out.add(new Insight("positive", "trending",
                        "Rendimento a subir",
                        "Este mês ganhaste mais " + fmtEur(diff) + " que em " + fmtMonth(previous) + "."));
            } else if (diff.signum() < 0) {
                out.add(new Insight("info", "trending",
                        "Rendimento mais baixo",
                        "Este mês recebeste menos " + fmtEur(diff.abs()) + " que em " + fmtMonth(previous) + "."));
            }
        }

        // sobra de rendimento por alocar
        if (income.monthlyIncome().signum() > 0 && income.unallocated().signum() > 0) {
            out.add(new Insight("info", "wallet",
                    "Rendimento por alocar",
                    "Ainda tens " + fmtEur(income.unallocated()) + " por distribuir este mês."));
        }

        return out;
    }

    /** "2026-06" -> "junho de 2026" (pt-PT). */
    private String fmtMonth(String m) {
        try {
            YearMonth ym = YearMonth.parse(m);
            String name = ym.getMonth().getDisplayName(java.time.format.TextStyle.FULL,
                    new java.util.Locale("pt", "PT"));
            return name + " de " + ym.getYear();
        } catch (Exception e) {
            return m;
        }
    }

    private String fmtPct(BigDecimal v) {
        return (v.signum() >= 0 ? "+" : "") + v.stripTrailingZeros().toPlainString() + "%";
    }

    /**
     * Emite um token {@code {eur:VALOR}} (valor em EUR) em vez de formatar aqui — o
     * frontend converte-o para a moeda base e formata (o backend não conhece a moeda
     * base de apresentação nem a taxa de câmbio).
     */
    private String fmtEur(BigDecimal v) {
        return "{eur:" + v.setScale(2, RoundingMode.HALF_UP).toPlainString() + "}";
    }
}
