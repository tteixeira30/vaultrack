package com.tracky.nav;

import com.tracky.achievements.AchievementsController;
import com.tracky.auth.User;
import com.tracky.calendar.CalendarEvent;
import com.tracky.calendar.CalendarEventRepository;
import com.tracky.expense.Account;
import com.tracky.expense.AccountRepository;
import com.tracky.expense.Transaction;
import com.tracky.expense.TransactionRepository;
import com.tracky.goal.Goal;
import com.tracky.goal.GoalRepository;
import com.tracky.investment.Investment;
import com.tracky.investment.InvestmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Contagens dos indicadores da navegação: os movimentos são só os do mês
 * corrente, o aviso das contas acende quando alguma não tem saldo, e as
 * conquistas vêm do controller respetivo em vez de serem recontadas aqui.
 */
@ExtendWith(MockitoExtension.class)
class NavControllerTest {

    @Mock TransactionRepository transactionRepo;
    @Mock InvestmentRepository investmentRepo;
    @Mock GoalRepository goalRepo;
    @Mock CalendarEventRepository calendarRepo;
    @Mock AccountRepository accountRepo;
    @Mock AchievementsController achievementsController;

    NavController controller;
    User user;

    @BeforeEach
    void setUp() {
        controller = new NavController(transactionRepo, investmentRepo, goalRepo,
                calendarRepo, accountRepo, achievementsController);
        user = org.mockito.Mockito.mock(User.class);
        lenient().when(user.getId()).thenReturn(1L);
        lenient().when(achievementsController.get(user)).thenReturn(achievements(14, 26));
    }

    private AchievementsController.AchievementsResponse achievements(int unlocked, int total) {
        return new AchievementsController.AchievementsResponse(
                5, "Nível 5", 300, 20, 60, unlocked, total, 0, List.of());
    }

    private Account account(BigDecimal balance) {
        Account a = new Account();
        a.setUserId(1L);
        a.setName("Conta");
        a.setCurrentBalance(balance);
        return a;
    }

    @Test
    void contaOsMovimentosDoMesCorrenteEOsRestantesTotais() {
        when(transactionRepo.findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(eq(1L), any(), any()))
                .thenReturn(List.of(new Transaction(), new Transaction(), new Transaction()));
        when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(new Investment(), new Investment()));
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(new Goal()));
        when(calendarRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(new CalendarEvent(), new CalendarEvent()));
        when(accountRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(account(BigDecimal.TEN)));

        NavController.NavCounts counts = controller.counts(user);

        assertThat(counts.transactions()).isEqualTo(3);
        assertThat(counts.investments()).isEqualTo(2);
        assertThat(counts.goals()).isEqualTo(1);
        assertThat(counts.events()).isEqualTo(2);
        assertThat(counts.achievementsUnlocked()).isEqualTo(14);
        assertThat(counts.achievementsTotal()).isEqualTo(26);
    }

    @Test
    void osMovimentosSaoPedidosSoParaOMesCorrente() {
        stubEmpty();
        YearMonth now = YearMonth.now();

        controller.counts(user);

        verify(transactionRepo).findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(
                1L, now.atDay(1), now.atEndOfMonth());
    }

    @Test
    void oAvisoAcendeQuandoAlgumaContaNaoTemSaldo() {
        stubEmpty();
        when(accountRepo.findByUserIdOrderByIdAsc(1L))
                .thenReturn(List.of(account(BigDecimal.TEN), account(null)));

        assertThat(controller.counts(user).accountsNeedAttention()).isTrue();
    }

    @Test
    void semContasNaoHaAviso() {
        stubEmpty();

        assertThat(controller.counts(user).accountsNeedAttention()).isFalse();
    }

    @Test
    void contaNovaDevolveTudoAZero() {
        stubEmpty();
        when(achievementsController.get(user)).thenReturn(achievements(0, 26));

        NavController.NavCounts counts = controller.counts(user);

        assertThat(counts.transactions()).isZero();
        assertThat(counts.investments()).isZero();
        assertThat(counts.goals()).isZero();
        assertThat(counts.events()).isZero();
        assertThat(counts.achievementsUnlocked()).isZero();
    }

    private void stubEmpty() {
        lenient().when(transactionRepo.findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(eq(1L), any(), any()))
                .thenReturn(List.of());
        lenient().when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
        lenient().when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
        lenient().when(calendarRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
        lenient().when(accountRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
    }
}
