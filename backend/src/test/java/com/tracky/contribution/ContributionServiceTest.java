package com.tracky.contribution;

import com.tracky.audit.AuditAction;
import com.tracky.audit.AuditService;
import com.tracky.goal.Goal;
import com.tracky.goal.GoalRepository;
import com.tracky.investment.Investment;
import com.tracky.investment.InvestmentRepository;
import com.tracky.investment.PriceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Testa o catch-up de depósitos mensais (objetivos e investimentos). */
@ExtendWith(MockitoExtension.class)
class ContributionServiceTest {

    @Mock GoalRepository goalRepo;
    @Mock InvestmentRepository investmentRepo;
    @Mock PriceService priceService;

    ContributionService service;

    @BeforeEach
    void setUp() {
        service = new ContributionService(goalRepo, investmentRepo, priceService);
        lenient().when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
        lenient().when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of());
    }

    /** Cria um serviço com "hoje" fixado numa data concreta. */
    private ContributionService serviceAt(LocalDate today) {
        ZoneId zone = ZoneId.of("Europe/Lisbon");
        Clock fixed = Clock.fixed(today.atStartOfDay(zone).toInstant(), zone);
        return new ContributionService(goalRepo, investmentRepo, priceService, fixed);
    }

    /** Simula o UPDATE atómico condicional de objetivo a aplicar (1 linha afetada). */
    private void goalDepositApplies() {
        when(goalRepo.applyAutoDeposit(any(), any(), any(), any())).thenReturn(1);
    }

    private Goal autoGoal(String monthly, String saved, String lastAppliedMonth) {
        Goal g = new Goal();
        g.setUserId(1L);
        g.setName("Objetivo");
        g.setTargetAmount(new BigDecimal("10000"));
        g.setMonthlyAllocation(new BigDecimal(monthly));
        g.setSavedAmount(new BigDecimal(saved));
        g.setAutoDeposit(true);
        g.setLastAppliedMonth(lastAppliedMonth);
        return g;
    }

    @Test
    void objetivoEmDiaNaoRecebeDeposito() {
        Goal g = autoGoal("100", "500", YearMonth.now().toString());
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));

        var result = service.apply(1L, "all", false);

        assertThat(result.applied()).isEmpty();
        verify(goalRepo, never()).applyAutoDeposit(any(), any(), any(), any());
    }

    @Test
    void depositosAplicadosFicamNaAuditoria() {
        AuditService audit = org.mockito.Mockito.mock(AuditService.class);
        service.setAudit(audit);
        Goal g = autoGoal("100", "500", YearMonth.now().minusMonths(1).toString());
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        service.apply(1L, "all", false);

        ArgumentCaptor<java.util.Map<String, Object>> details = ArgumentCaptor.captor();
        verify(audit).record(eq(1L), eq(AuditAction.CONTRIBUTIONS_APPLIED), isNull(), isNull(), details.capture());
        assertThat((BigDecimal) details.getValue().get("total")).isEqualByComparingTo("100");
        assertThat(details.getValue().get("forced")).isEqualTo(false);
    }

    @Test
    void semDepositosNaoHaEventoDeAuditoria() {
        AuditService audit = org.mockito.Mockito.mock(AuditService.class);
        service.setAudit(audit);
        Goal g = autoGoal("100", "500", YearMonth.now().toString());
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));

        service.apply(1L, "all", false);

        verify(audit, never()).record(any(), any(), any(), any(), anyMap());
    }

    @Test
    void catchUpAplicaTodosOsMesesEmAtraso() {
        // último aplicado há 3 meses → 3 depósitos de 100€
        String threeMonthsAgo = YearMonth.now().minusMonths(3).toString();
        Goal g = autoGoal("100", "500", threeMonthsAgo);
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = service.apply(1L, "all", false);

        assertThat(result.applied()).hasSize(1);
        assertThat(result.applied().get(0).months()).isEqualTo(3);
        assertThat(result.totalAmount()).isEqualByComparingTo("300.00");

        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<String> newMonth = ArgumentCaptor.forClass(String.class);
        verify(goalRepo).applyAutoDeposit(any(), amount.capture(), any(), newMonth.capture());
        assertThat(amount.getValue()).isEqualByComparingTo("300");
        assertThat(newMonth.getValue()).isEqualTo(YearMonth.now().toString());
    }

    @Test
    void forceAplicaExatamenteUmMesEAvancaOMarcador() {
        String current = YearMonth.now().toString();
        Goal g = autoGoal("100", "500", current);
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = service.apply(1L, "all", true);

        assertThat(result.applied()).hasSize(1);
        // o marcador avança para o mês seguinte — o scheduler não repete este mês
        ArgumentCaptor<String> newMonth = ArgumentCaptor.forClass(String.class);
        verify(goalRepo).applyAutoDeposit(any(), any(), any(), newMonth.capture());
        assertThat(newMonth.getValue()).isEqualTo(YearMonth.now().plusMonths(1).toString());
    }

    @Test
    void naoUltrapassaOAlvoQuandoQuaseConcluido() {
        // falta 50€ para o alvo mas a alocação mensal é 100€ → só deposita os 50€ em falta
        Goal g = autoGoal("100", "9950", YearMonth.now().minusMonths(1).toString());
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = service.apply(1L, "all", false);

        assertThat(result.applied()).hasSize(1);
        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        verify(goalRepo).applyAutoDeposit(any(), amount.capture(), any(), any());
        assertThat(amount.getValue()).isEqualByComparingTo("50");
    }

    @Test
    void objetivoConcluidoNaoDepositaMasAvancaOMarcador() {
        // objetivo já no alvo: não deposita (amount 0) mas o marcador avança para não
        // acumular meses pendentes que rebentariam se o alvo subisse depois
        Goal g = autoGoal("100", "10000", YearMonth.now().minusMonths(1).toString());
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = service.apply(1L, "all", false);

        assertThat(result.applied()).isEmpty(); // nada mostrado ao utilizador
        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        verify(goalRepo).applyAutoDeposit(any(), amount.capture(), any(), any());
        assertThat(amount.getValue()).isEqualByComparingTo("0"); // marcador avança na mesma
    }

    @Test
    void objetivoSemAutoDepositoOuSemMarcadorEIgnorado() {
        Goal semAuto = autoGoal("100", "0", YearMonth.now().minusMonths(2).toString());
        semAuto.setAutoDeposit(false);
        Goal semMarcador = autoGoal("100", "0", null); // legado: nunca aplicado → não faz catch-up
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(semAuto, semMarcador));

        var result = service.apply(1L, "all", false);

        assertThat(result.applied()).isEmpty();
        verify(goalRepo, never()).applyAutoDeposit(any(), any(), any(), any());
    }

    @Test
    void scopeGoalsNaoTocaNosInvestimentos() {
        Goal g = autoGoal("100", "0", YearMonth.now().minusMonths(1).toString());
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = service.apply(1L, "goals", false);

        assertThat(result.applied()).hasSize(1);
        verify(investmentRepo, never()).findByUserIdOrderByIdAsc(1L);
    }

    @Test
    void reforcoDeInvestimentoManualSomaAoFallback() {
        Investment inv = new Investment();
        inv.setUserId(1L);
        inv.setName("PPR");
        inv.setType(Investment.Type.OTHER);
        inv.setFallbackValue(new BigDecimal("1000"));
        inv.setInitialValue(new BigDecimal("1000"));
        inv.setMonthlyContribution(new BigDecimal("50"));
        inv.setLastAppliedMonth(YearMonth.now().minusMonths(2).toString());
        when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(inv));
        when(investmentRepo.applyReinforcementValue(any(), any(), any(), any())).thenReturn(1);

        var result = service.apply(1L, "investments", false);

        assertThat(result.applied()).hasSize(1);
        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        verify(investmentRepo).applyReinforcementValue(any(), amount.capture(), any(), any());
        assertThat(amount.getValue()).isEqualByComparingTo("100"); // 2 × 50€
    }

    @Test
    void reforcoComCotacaoCompraUnidadesAoPrecoAtual() {
        Investment inv = new Investment();
        inv.setUserId(1L);
        inv.setName("ETF");
        inv.setSymbol("VWCE.DE");
        inv.setType(Investment.Type.ETF);
        inv.setQuantity(new BigDecimal("10"));
        inv.setInitialValue(new BigDecimal("1000"));
        inv.setMonthlyContribution(new BigDecimal("100"));
        inv.setLastAppliedMonth(YearMonth.now().minusMonths(1).toString());
        when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(inv));
        when(priceService.getPriceEur("VWCE.DE", Investment.Type.ETF))
                .thenReturn(Optional.of(new BigDecimal("50")));
        when(investmentRepo.applyReinforcementUnits(any(), any(), any(), any(), any())).thenReturn(1);

        service.apply(1L, "investments", false);

        ArgumentCaptor<BigDecimal> units = ArgumentCaptor.forClass(BigDecimal.class);
        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        verify(investmentRepo).applyReinforcementUnits(any(), units.capture(), amount.capture(), any(), any());
        assertThat(units.getValue()).isEqualByComparingTo("2"); // 100€ / 50€ = 2 unidades
        assertThat(amount.getValue()).isEqualByComparingTo("100");
    }

    // ---------- dia do mês configurável (contributionDay) ----------

    @Test
    void semDiaConfiguradoAplicaNoDia1ComoAntes() {
        // legado: contributionDay null → dia efetivo 1, aplica logo no arranque do mês
        Goal g = autoGoal("100", "500", "2025-05");
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = serviceAt(LocalDate.of(2025, 6, 1)).apply(1L, "all", false);

        assertThat(result.applied()).hasSize(1);
        ArgumentCaptor<String> newMonth = ArgumentCaptor.forClass(String.class);
        verify(goalRepo).applyAutoDeposit(any(), any(), any(), newMonth.capture());
        assertThat(newMonth.getValue()).isEqualTo("2025-06");
    }

    @Test
    void mesCorrenteSoAplicaAPartirDoDiaConfigurado() {
        Goal g = autoGoal("100", "500", "2025-05");
        g.setContributionDay(10);
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        lenient().when(goalRepo.applyAutoDeposit(any(), any(), any(), any())).thenReturn(1);

        // dia 9: ainda não chegou ao dia do depósito → nada acontece
        var antes = serviceAt(LocalDate.of(2025, 6, 9)).apply(1L, "all", false);
        assertThat(antes.applied()).isEmpty();
        verify(goalRepo, never()).applyAutoDeposit(any(), any(), any(), any());

        // dia 10: aplica o mês corrente
        var depois = serviceAt(LocalDate.of(2025, 6, 10)).apply(1L, "all", false);
        assertThat(depois.applied()).hasSize(1);
    }

    @Test
    void dia31EmMesCurtoAplicaNoUltimoDiaDoMes() {
        Goal g = autoGoal("100", "0", "2025-05");
        g.setContributionDay(31); // junho só tem 30 dias → dia efetivo é 30
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        lenient().when(goalRepo.applyAutoDeposit(any(), any(), any(), any())).thenReturn(1);

        assertThat(serviceAt(LocalDate.of(2025, 6, 29)).apply(1L, "all", false).applied()).isEmpty();

        var result = serviceAt(LocalDate.of(2025, 6, 30)).apply(1L, "all", false);
        assertThat(result.applied()).hasSize(1);
    }

    @Test
    void catchUpDeMesesInteirosEmAtrasoIgnoraODia() {
        // último aplicado em março; hoje é 5 de junho com dia configurado 10:
        // abril e maio (meses inteiros em atraso) aplicam-se já; junho só no dia 10
        Goal g = autoGoal("100", "0", "2025-03");
        g.setContributionDay(10);
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));
        goalDepositApplies();

        var result = serviceAt(LocalDate.of(2025, 6, 5)).apply(1L, "all", false);

        assertThat(result.applied()).hasSize(1);
        assertThat(result.applied().get(0).months()).isEqualTo(2);
        ArgumentCaptor<String> newMonth = ArgumentCaptor.forClass(String.class);
        verify(goalRepo).applyAutoDeposit(any(), any(), any(), newMonth.capture());
        assertThat(newMonth.getValue()).isEqualTo("2025-05"); // junho fica pendente até ao dia 10
    }

    @Test
    void mudarODiaNaoReaplicaMesJaAplicado() {
        // o mês corrente já foi aplicado (ex.: dia era 5); o utilizador muda o dia para 1:
        // não há segunda aplicação — o lastAppliedMonth é que manda
        Goal g = autoGoal("100", "600", "2025-06");
        g.setContributionDay(1);
        when(goalRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(g));

        var result = serviceAt(LocalDate.of(2025, 6, 20)).apply(1L, "all", false);

        assertThat(result.applied()).isEmpty();
        verify(goalRepo, never()).applyAutoDeposit(any(), any(), any(), any());
    }

    @Test
    void diaConfiguradoTambemValeParaInvestimentos() {
        Investment inv = new Investment();
        inv.setUserId(1L);
        inv.setName("PPR");
        inv.setType(Investment.Type.OTHER);
        inv.setFallbackValue(new BigDecimal("1000"));
        inv.setInitialValue(new BigDecimal("1000"));
        inv.setMonthlyContribution(new BigDecimal("50"));
        inv.setContributionDay(15);
        inv.setLastAppliedMonth("2025-05");
        when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(inv));
        lenient().when(investmentRepo.applyReinforcementValue(any(), any(), any(), any())).thenReturn(1);

        assertThat(serviceAt(LocalDate.of(2025, 6, 14)).apply(1L, "investments", false).applied()).isEmpty();

        var result = serviceAt(LocalDate.of(2025, 6, 15)).apply(1L, "investments", false);
        assertThat(result.applied()).hasSize(1);
        ArgumentCaptor<String> newMonth = ArgumentCaptor.forClass(String.class);
        verify(investmentRepo).applyReinforcementValue(any(), any(), any(), newMonth.capture());
        assertThat(newMonth.getValue()).isEqualTo("2025-06");
    }

    @Test
    void semPrecoDisponivelOReforcoFicaPendente() {
        Investment inv = new Investment();
        inv.setUserId(1L);
        inv.setName("ETF");
        inv.setSymbol("VWCE.DE");
        inv.setType(Investment.Type.ETF);
        inv.setQuantity(new BigDecimal("10"));
        inv.setInitialValue(new BigDecimal("1000"));
        inv.setMonthlyContribution(new BigDecimal("100"));
        String lastMonth = YearMonth.now().minusMonths(1).toString();
        inv.setLastAppliedMonth(lastMonth);
        when(investmentRepo.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(inv));
        when(priceService.getPriceEur("VWCE.DE", Investment.Type.ETF)).thenReturn(Optional.empty());

        var result = service.apply(1L, "investments", false);

        // nada aplicado e o marcador não avança — tenta de novo na próxima execução
        assertThat(result.applied()).isEmpty();
        verify(investmentRepo, never()).applyReinforcementUnits(any(), any(), any(), any(), any());
    }
}
