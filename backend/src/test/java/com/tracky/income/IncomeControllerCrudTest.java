package com.tracky.income;

import com.tracky.TestSupport;
import com.tracky.auth.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Cobre o CRUD de categorias/itens, o copy-forward ao entrar num mês novo e a
 * migração de linhas legadas — complementa o IncomeControllerTest (agregação).
 */
@ExtendWith(MockitoExtension.class)
class IncomeControllerCrudTest {

    private static final String PAST = "2020-01"; // nunca é o mês atual → sem copy-forward

    @Mock IncomeSettingsRepository incomeRepo;
    @Mock AllocationRepository allocationRepo;
    @Mock AllocationItemRepository itemRepo;

    IncomeController controller;
    User user;

    @BeforeEach
    void setUp() {
        controller = new IncomeController(incomeRepo, allocationRepo, itemRepo);
        user = mock(User.class);
        lenient().when(user.getId()).thenReturn(1L);
        // sem legado e sem dados por omissão
        lenient().when(incomeRepo.findByUserIdAndMonthIsNull(1L)).thenReturn(List.of());
        lenient().when(allocationRepo.findByUserIdAndMonthIsNull(1L)).thenReturn(List.of());
        lenient().when(incomeRepo.findByUserIdOrderByMonthAsc(1L)).thenReturn(List.of());
        lenient().when(allocationRepo.findByUserIdAndMonthOrderByIdAsc(eq(1L), any())).thenReturn(List.of());
        lenient().when(incomeRepo.findByUserIdAndMonthOrderByIdAsc(eq(1L), any())).thenReturn(List.of());
        lenient().when(incomeRepo.save(any())).thenAnswer(a -> a.getArgument(0));
        lenient().when(allocationRepo.save(any())).thenAnswer(a -> a.getArgument(0));
        lenient().when(itemRepo.save(any())).thenAnswer(a -> a.getArgument(0));
    }

    private Allocation alloc(long id, String pct, String fixed) {
        Allocation a = new Allocation();
        a.setUserId(1L);
        a.setMonth(PAST);
        a.setName("Categoria");
        if (pct != null) a.setPercentage(new BigDecimal(pct));
        if (fixed != null) a.setFixedAmount(new BigDecimal(fixed));
        TestSupport.setId(a, id);
        return a;
    }

    // ---------- setIncome ----------

    @Test
    void setIncomeGuardaORendimentoDoMes() {
        // o mês já existe (linha mutável, partilhada pelas releituras do mock)
        IncomeSettings existing = new IncomeSettings();
        existing.setUserId(1L);
        existing.setMonth(PAST);
        when(incomeRepo.findByUserIdAndMonthOrderByIdAsc(1L, PAST)).thenReturn(List.of(existing));

        var resp = controller.setIncome(user, PAST, new IncomeController.IncomeRequest(new BigDecimal("2000")));

        assertThat(resp.month()).isEqualTo(PAST);
        assertThat(resp.monthlyIncome()).isEqualByComparingTo("2000");
        assertThat(existing.getMonthlyIncome()).isEqualByComparingTo("2000");
    }

    // ---------- addAllocation ----------

    @Test
    void addAllocationPorPercentagemGuardaACategoria() {
        var resp = controller.addAllocation(user, PAST,
                new IncomeController.AllocationRequest("Poupança", new BigDecimal("30"), null, "#AABBCC"));

        assertThat(resp.month()).isEqualTo(PAST);
        verify(allocationRepo).save(any(Allocation.class));
    }

    @Test
    void addAllocationPorValorFixoGuardaACategoria() {
        var resp = controller.addAllocation(user, PAST,
                new IncomeController.AllocationRequest("Renda", null, new BigDecimal("450"), null));

        assertThat(resp.month()).isEqualTo(PAST);
        verify(allocationRepo).save(any(Allocation.class));
    }

    // ---------- updateAllocation ----------

    @Test
    void updateAllocationAlteraUmaCategoriaExistente() {
        Allocation a = alloc(10L, "20", null);
        when(allocationRepo.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(a));

        var resp = controller.updateAllocation(user, 10L,
                new IncomeController.AllocationRequest("Nova", new BigDecimal("40"), null, null));

        assertThat(a.getName()).isEqualTo("Nova");
        assertThat(a.getPercentage()).isEqualByComparingTo("40");
        assertThat(resp.month()).isEqualTo(PAST);
    }

    @Test
    void updateAllocationInexistenteDa404() {
        when(allocationRepo.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.updateAllocation(user, 99L,
                new IncomeController.AllocationRequest("X", new BigDecimal("10"), null, null)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    // ---------- deleteAllocation ----------

    @Test
    void deleteAllocationRemoveACategoriaEOsSeusItens() {
        Allocation a = alloc(10L, "20", null);
        when(allocationRepo.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(a));
        AllocationItem it = new AllocationItem();
        it.setAllocationId(10L);
        when(itemRepo.findByAllocationIdOrderByIdAsc(10L)).thenReturn(List.of(it));

        controller.deleteAllocation(user, 10L);

        verify(itemRepo).deleteAll(List.of(it));
        verify(allocationRepo).delete(a);
    }

    @Test
    void deleteAllocationInexistenteNaoRebenta() {
        when(allocationRepo.findByIdAndUserId(77L, 1L)).thenReturn(Optional.empty());

        controller.deleteAllocation(user, 77L); // sem exceção

        verify(allocationRepo, never()).delete(any());
    }

    // ---------- itens ----------

    @Test
    void addItemGuardaOItemNaCategoria() {
        Allocation a = alloc(10L, "20", null);
        when(allocationRepo.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(a));

        var resp = controller.addItem(user, 10L,
                new IncomeController.AllocationItemRequest("  Netflix  ", new BigDecimal("12")));

        assertThat(resp.month()).isEqualTo(PAST);
        verify(itemRepo).save(any(AllocationItem.class));
    }

    @Test
    void addItemComValorNegativoERejeitado() {
        Allocation a = alloc(10L, "20", null);
        when(allocationRepo.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(a));

        assertThatThrownBy(() -> controller.addItem(user, 10L,
                new IncomeController.AllocationItemRequest("Mau", new BigDecimal("-5"))))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void updateItemAlteraNomeEValor() {
        AllocationItem it = new AllocationItem();
        it.setUserId(1L);
        it.setAllocationId(10L);
        TestSupport.setId(it, 55L);
        when(itemRepo.findByIdAndUserId(55L, 1L)).thenReturn(Optional.of(it));
        when(allocationRepo.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(alloc(10L, "20", null)));

        controller.updateItem(user, 55L,
                new IncomeController.AllocationItemRequest("HBO", new BigDecimal("9")));

        assertThat(it.getName()).isEqualTo("HBO");
        assertThat(it.getAmount()).isEqualByComparingTo("9");
    }

    @Test
    void deleteItemRemoveOItem() {
        AllocationItem it = new AllocationItem();
        it.setUserId(1L);
        it.setAllocationId(10L);
        TestSupport.setId(it, 55L);
        when(itemRepo.findByIdAndUserId(55L, 1L)).thenReturn(Optional.of(it));
        when(allocationRepo.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(alloc(10L, "20", null)));

        controller.deleteItem(user, 55L);

        verify(itemRepo).delete(it);
    }

    // ---------- migração de linhas legadas ----------

    @Test
    void linhasLegadasSemMesSaoMigradasParaOMesAtual() {
        String current = YearMonth.now().toString();
        IncomeSettings legacy = new IncomeSettings();
        legacy.setUserId(1L);
        legacy.setMonthlyIncome(new BigDecimal("1500"));
        when(incomeRepo.findByUserIdAndMonthIsNull(1L)).thenReturn(List.of(legacy));

        // qualquer endpoint corre migrateLegacyRows primeiro
        controller.addAllocation(user, PAST,
                new IncomeController.AllocationRequest("X", new BigDecimal("10"), null, null));

        assertThat(legacy.getMonth()).isEqualTo(current);
        verify(incomeRepo, org.mockito.Mockito.atLeastOnce()).save(legacy);
    }

    // ---------- copy-forward ao entrar num mês novo ----------

    @Test
    void mesNovoCopiaRendimentoECategoriasDoMesAnterior() {
        String current = YearMonth.now().toString();

        IncomeSettings prev = new IncomeSettings();
        prev.setUserId(1L);
        prev.setMonth(PAST);
        prev.setMonthlyIncome(new BigDecimal("1800"));
        when(incomeRepo.findByUserIdOrderByMonthAsc(1L)).thenReturn(List.of(prev));

        // mês atual ainda não existe → dispara o copy-forward
        when(incomeRepo.findByUserIdAndMonthOrderByIdAsc(1L, current)).thenReturn(List.of());

        Allocation prevAlloc = alloc(10L, "25", null);
        when(allocationRepo.findByUserIdAndMonthOrderByIdAsc(1L, PAST)).thenReturn(List.of(prevAlloc));
        AllocationItem prevItem = new AllocationItem();
        prevItem.setAllocationId(10L);
        prevItem.setName("Spotify");
        prevItem.setAmount(new BigDecimal("7"));
        when(itemRepo.findByAllocationIdOrderByIdAsc(10L)).thenReturn(List.of(prevItem));
        // a categoria copiada recebe um id ao ser guardada (para associar o item)
        when(allocationRepo.save(any(Allocation.class))).thenAnswer(a -> {
            Allocation copy = a.getArgument(0);
            TestSupport.setId(copy, 20L);
            return copy;
        });
        // no mês atual (após a cópia) a leitura das categorias fica vazia — basta validar a cópia
        when(allocationRepo.findByUserIdAndMonthOrderByIdAsc(1L, current)).thenReturn(List.of());

        var resp = controller.get(user, null); // null → mês atual

        assertThat(resp.month()).isEqualTo(current);
        assertThat(resp.monthlyIncome()).isEqualByComparingTo("1800"); // rendimento copiado
        assertThat(resp.copiedFrom()).isEqualTo(PAST);
        // guardou a categoria copiada e o item copiado
        verify(allocationRepo).save(any(Allocation.class));
        verify(itemRepo).save(any(AllocationItem.class));
    }
}
