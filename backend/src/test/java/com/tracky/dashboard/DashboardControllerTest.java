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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Testa a agregação do DashboardController com os controllers de funcionalidade
 * mockados: património = investido atual + poupado, progresso global dos
 * objetivos, atividade recente (ordenada) e a geração de insights.
 */
@ExtendWith(MockitoExtension.class)
class DashboardControllerTest {

    @Mock IncomeController incomeController;
    @Mock InvestmentController investmentController;
    @Mock GoalController goalController;
    @Mock ExpenseController expenseController;
    @Mock InvestmentRepository investmentRepo;
    @Mock GoalRepository goalRepo;

    DashboardController controller;
    User user;

    @BeforeEach
    void setUp() {
        controller = new DashboardController(incomeController, investmentController,
                goalController, expenseController, investmentRepo, goalRepo);
        user = org.mockito.Mockito.mock(User.class);
        lenient().when(user.getId()).thenReturn(1L);
        // stats() é sempre invocado pelo get(); sem despesas → não gera insight de despesas
        lenient().when(expenseController.stats(user)).thenReturn(emptyExpenseStats());
    }

    private ExpenseController.ExpenseStats emptyExpenseStats() {
        return new ExpenseController.ExpenseStats(List.of(), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), false);
    }

    private IncomeController.IncomeResponse income(String month, BigDecimal monthly, BigDecimal unallocated,
                                                   List<String> months) {
        return new IncomeController.IncomeResponse(month, true, monthly, List.of(),
                BigDecimal.ZERO, BigDecimal.ZERO, unallocated, months, null);
    }

    private InvestmentController.PortfolioResponse portfolio(String invested, String current,
                                                             String gain, String gainPct) {
        var summary = new InvestmentController.Summary(new BigDecimal(invested), new BigDecimal(current),
                new BigDecimal(gain), new BigDecimal(gainPct));
        return new InvestmentController.PortfolioResponse(summary, List.of());
    }

    private GoalController.GoalDto goal(String name, String target, String saved, String progress) {
        return new GoalController.GoalDto(1L, name, new BigDecimal(target), new BigDecimal("50"),
                new BigDecimal(saved), new BigDecimal(progress), 3, LocalDate.now().plusMonths(3), true, 1);
    }

    private void stubBase(IncomeController.IncomeResponse inc,
                          InvestmentController.PortfolioResponse pf,
                          List<GoalController.GoalDto> goals) {
        when(incomeController.get(eq(user), any())).thenReturn(inc);
        when(investmentController.list(user)).thenReturn(pf);
        when(goalController.list(user)).thenReturn(goals);
        lenient().when(investmentController.history(eq(user), any())).thenReturn(List.of());
        lenient().when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
        lenient().when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
    }

    @Test
    void patrimonioSomaInvestimentoAtualComPoupanca() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("1000", "1200", "200", "20"),
                List.of(goal("Carro", "5000", "800", "16"), goal("Casa", "10000", "1200", "12")));

        var resp = controller.get(user);

        // 1200 (investido atual) + 800 + 1200 (poupado) = 3200
        assertThat(resp.netWorth()).isEqualByComparingTo("3200.00");
        assertThat(resp.totalSaved()).isEqualByComparingTo("2000.00");
        assertThat(resp.totalGoalsTarget()).isEqualByComparingTo("15000.00");
        assertThat(resp.goalsCount()).isEqualTo(2);
    }

    @Test
    void progressoGlobalDosObjetivosELimitadoA100() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("0", "0", "0", "0"),
                List.of(goal("Poupança", "1000", "2000", "100"))); // já ultrapassou o alvo

        var resp = controller.get(user);

        assertThat(resp.goalsProgressPercent()).isEqualByComparingTo("100");
        assertThat(resp.goalsCompleted()).isEqualTo(1);
    }

    @Test
    void objetivosSemAlvoDaoProgressoZeroSemRebentar() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("0", "0", "0", "0"),
                List.of(goal("Vazio", "0", "0", "0")));

        var resp = controller.get(user);

        assertThat(resp.goalsProgressPercent()).isEqualByComparingTo("0");
    }

    @Test
    void insightDePortfolioAValorizarQuandoGanhoPositivo() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("1000", "1200", "200", "20"),
                List.of());

        var resp = controller.get(user);

        assertThat(resp.insights()).anySatisfy(i -> {
            assertThat(i.kind()).isEqualTo("positive");
            assertThat(i.title()).isEqualTo("Portefólio a valorizar");
        });
    }

    @Test
    void insightDePortfolioEmQuedaQuandoGanhoNegativo() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("1000", "800", "-200", "-20"),
                List.of());

        var resp = controller.get(user);

        assertThat(resp.insights()).anySatisfy(i -> {
            assertThat(i.kind()).isEqualTo("warning");
            assertThat(i.title()).isEqualTo("Portefólio em queda");
        });
    }

    @Test
    void percentagensDosInsightsUsamVirgulaDecimalPtPt() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("1000", "885.70", "-114.30", "-11.43"),
                List.of(goal("Férias", "1000", "855", "85.5")));

        var resp = controller.get(user);

        assertThat(resp.insights()).anySatisfy(i -> assertThat(i.detail()).contains("\u221211,43%"));
        assertThat(resp.insights()).anySatisfy(i -> assertThat(i.detail()).contains("85,5%"));
        assertThat(resp.insights()).noneSatisfy(i -> assertThat(i.detail()).containsPattern("\\d\\.\\d+%"));
    }

    @Test
    void percentagemPositivaLevaSinalMais() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("1000", "1120.5", "120.5", "12.05"),
                List.of());

        assertThat(controller.get(user).insights())
                .anySatisfy(i -> assertThat(i.detail()).contains("+12,05%"));
    }

    @Test
    void insightDeObjetivoQuaseConcluidoEntre80E100() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("0", "0", "0", "0"),
                List.of(goal("Férias", "1000", "850", "85")));

        var resp = controller.get(user);

        assertThat(resp.insights()).anySatisfy(i ->
                assertThat(i.title()).isEqualTo("Objetivo quase concluído"));
    }

    @Test
    void insightDeRendimentoPorAlocarQuandoSobra() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), new BigDecimal("300"), List.of()),
                portfolio("0", "0", "0", "0"),
                List.of());

        var resp = controller.get(user);

        assertThat(resp.insights()).anySatisfy(i ->
                assertThat(i.title()).isEqualTo("Rendimento por alocar"));
    }

    @Test
    void insightDeRendimentoASubirComparaComMesAnterior() {
        String current = YearMonth.now().toString();
        String previous = YearMonth.now().minusMonths(1).toString();
        when(incomeController.get(eq(user), any())).thenAnswer(a -> {
            String m = a.getArgument(1);
            if (previous.equals(m)) {
                return income(previous, new BigDecimal("1500"), BigDecimal.ZERO, List.of());
            }
            return income(current, new BigDecimal("2000"), BigDecimal.ZERO, List.of(previous, current));
        });
        when(investmentController.list(user)).thenReturn(portfolio("0", "0", "0", "0"));
        when(goalController.list(user)).thenReturn(List.of());
        lenient().when(investmentController.history(eq(user), any())).thenReturn(List.of());
        lenient().when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
        lenient().when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());

        var resp = controller.get(user);

        assertThat(resp.insights()).anySatisfy(i ->
                assertThat(i.title()).isEqualTo("Rendimento a subir"));
    }

    @Test
    void atividadeRecenteOrdenaPorDataDescendenteELimitaA6() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("0", "0", "0", "0"),
                List.of());

        Investment older = new Investment();
        older.setName("Antigo");
        setCreatedAt(older, Instant.parse("2025-01-01T00:00:00Z"));
        Investment newer = new Investment();
        newer.setName("Recente");
        setCreatedAt(newer, Instant.parse("2025-06-01T00:00:00Z"));
        when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(older, newer));

        Goal g = new Goal();
        g.setName("Objetivo");
        setCreatedAt(g, Instant.parse("2025-03-01T00:00:00Z"));
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));

        var resp = controller.get(user);

        assertThat(resp.recentActivity()).hasSize(3);
        assertThat(resp.recentActivity().get(0).title()).isEqualTo("Recente");
        assertThat(resp.recentActivity().get(2).title()).isEqualTo("Antigo");
    }

    @Test
    void evolucaoDeslocaHistoricoPeloTotalPoupado() {
        stubBase(
                income(YearMonth.now().toString(), new BigDecimal("2000"), BigDecimal.ZERO, List.of()),
                portfolio("1000", "1000", "0", "0"),
                List.of(goal("Poupança", "5000", "500", "10")));
        when(investmentController.history(eq(user), any())).thenReturn(List.of(
                new InvestmentController.PortfolioPoint(LocalDate.of(2025, 1, 1), new BigDecimal("1000"))));

        var resp = controller.get(user);

        // ponto do histórico (1000) + poupado (500) = 1500
        assertThat(resp.evolution()).hasSize(1);
        assertThat(resp.evolution().get(0).value()).isEqualByComparingTo("1500.00");
    }

    private static void setCreatedAt(Object entity, Instant when) {
        try {
            var f = entity.getClass().getDeclaredField("createdAt");
            f.setAccessible(true);
            f.set(entity, when);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
