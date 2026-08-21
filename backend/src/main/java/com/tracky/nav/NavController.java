package com.tracky.nav;

import com.tracky.achievements.AchievementsController;
import com.tracky.auth.User;
import com.tracky.calendar.CalendarEventRepository;
import com.tracky.expense.AccountRepository;
import com.tracky.expense.TransactionRepository;
import com.tracky.goal.GoalRepository;
import com.tracky.investment.InvestmentRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * Contagens para os indicadores da navegação — os números pequenos ao lado de
 * cada item da sidebar.
 *
 * Existe para o shell não ter de chamar seis endpoints só para os desenhar. As
 * contagens vêm dos repositórios (uma consulta cada, sem cotações); só as
 * conquistas reutilizam o `AchievementsController`, que é onde a regra de
 * "desbloqueada" vive — duplicá-la aqui era garantir que divergiam.
 */
@RestController
@RequestMapping("/api/nav")
public class NavController {

    private final TransactionRepository transactionRepo;
    private final InvestmentRepository investmentRepo;
    private final GoalRepository goalRepo;
    private final CalendarEventRepository calendarRepo;
    private final AccountRepository accountRepo;
    private final AchievementsController achievementsController;

    public NavController(TransactionRepository transactionRepo, InvestmentRepository investmentRepo,
                         GoalRepository goalRepo, CalendarEventRepository calendarRepo,
                         AccountRepository accountRepo, AchievementsController achievementsController) {
        this.transactionRepo = transactionRepo;
        this.investmentRepo = investmentRepo;
        this.goalRepo = goalRepo;
        this.calendarRepo = calendarRepo;
        this.accountRepo = accountRepo;
        this.achievementsController = achievementsController;
    }

    /**
     * @param accountsNeedAttention há contas sem saldo registado — sem ele a
     *                              previsão de saldo do calendário não funciona,
     *                              e é a única contagem que o design mostra a
     *                              âmbar em vez de a azul.
     */
    public record NavCounts(
            long transactions,
            long investments,
            long goals,
            long events,
            int achievementsUnlocked,
            int achievementsTotal,
            boolean accountsNeedAttention) {}

    @GetMapping
    public NavCounts counts(@AuthenticationPrincipal User user) {
        YearMonth month = YearMonth.now();
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();

        long transactions = transactionRepo
                .findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(user.getId(), from, to).size();

        var accounts = accountRepo.findByUserIdOrderByIdAsc(user.getId());
        boolean needsAttention = accounts.stream().anyMatch(a -> a.getCurrentBalance() == null);

        var achievements = achievementsController.get(user);

        return new NavCounts(
                transactions,
                investmentRepo.findByUserIdOrderByIdAsc(user.getId()).size(),
                goalRepo.findByUserIdOrderByIdAsc(user.getId()).size(),
                calendarRepo.findByUserIdOrderByIdAsc(user.getId()).size(),
                achievements.unlocked(),
                achievements.total(),
                needsAttention);
    }
}
