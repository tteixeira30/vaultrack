package com.tracky.expense;

import com.tracky.auth.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Testa a lógica do ExpenseController: chave de categorização, propagação de
 * categorias a movimentos semelhantes, estatísticas, dedupe de importação,
 * agregação mensal e o scoping das contas ao utilizador.
 */
@ExtendWith(MockitoExtension.class)
class ExpenseControllerTest {

    @Mock AccountRepository accounts;
    @Mock TransactionRepository transactions;
    @Mock CategoryRuleRepository rules;
    @Mock ExpenseCategoryRepository categories;

    @Test
    void categoryKeyIgnoraReferenciasDatasEPontuacao() {
        // referências e datas diferentes → mesma chave (mesmo comerciante)
        assertThat(ExpenseController.categoryKey("COMPRA 1234 CONTINENTE COLOMBO 12/03"))
                .isEqualTo("compra continente colombo");
        assertThat(ExpenseController.categoryKey("COMPRA 5678 CONTINENTE COLOMBO 15/04"))
                .isEqualTo("compra continente colombo");
        // mantém letras acentuadas
        assertThat(ExpenseController.categoryKey("CAFÉ CENTRAL 99")).isEqualTo("café central");
        // descrições só com números/pontuação → chave vazia (não gera regra)
        assertThat(ExpenseController.categoryKey("   ")).isEmpty();
        assertThat(ExpenseController.categoryKey(null)).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void applyToSimilarPropagaCategoriaAMovimentosDoMesmoComercianteComReferenciasDiferentes() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(account.getName()).thenReturn("Santander");
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(rules.findByUserIdAndMatchKey(1L, "compra continente colombo")).thenReturn(Optional.empty());

        // movimentos existentes: dois do mesmo comerciante (referências diferentes) + um não relacionado
        Transaction t1 = tx("COMPRA 1111 CONTINENTE COLOMBO 01/03", "OTHER");
        Transaction t2 = tx("COMPRA 2222 CONTINENTE COLOMBO 09/03", "OTHER");
        Transaction netflix = tx("NETFLIX 12/03", "OTHER");
        when(transactions.findByUserId(1L)).thenReturn(List.of(t1, t2, netflix));

        var req = new ExpenseController.TransactionRequest(10L, LocalDate.of(2026, 3, 20),
                "COMPRA 3333 CONTINENTE COLOMBO 20/03", new BigDecimal("30"), false, "GROCERIES", true);
        controller.create(user, req);

        // guarda a regra com a chave do comerciante (sem referências/datas)
        ArgumentCaptor<CategoryRule> ruleCap = ArgumentCaptor.forClass(CategoryRule.class);
        verify(rules).save(ruleCap.capture());
        assertThat(ruleCap.getValue().getMatchKey()).isEqualTo("compra continente colombo");
        assertThat(ruleCap.getValue().getCategory()).isEqualTo("GROCERIES");

        // recategoriza os dois movimentos do mesmo comerciante; o Netflix fica intacto
        ArgumentCaptor<List<Transaction>> savedCap = ArgumentCaptor.forClass(List.class);
        verify(transactions).saveAll(savedCap.capture());
        assertThat(savedCap.getValue()).containsExactlyInAnyOrder(t1, t2);
        assertThat(t1.getCategory()).isEqualTo("GROCERIES");
        assertThat(t2.getCategory()).isEqualTo("GROCERIES");
        assertThat(netflix.getCategory()).isEqualTo("OTHER");
    }

    @Test
    void statsAgregaSaidasPorMesMediaAnualETopCategorias() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        YearMonth current = YearMonth.now();
        YearMonth prev = current.minusMonths(1);

        // mês atual: 100 (supermercado) + 50 (transportes) de saída, 1500 de entrada
        Transaction a = txOn(current.atDay(3), new BigDecimal("100"), false, "GROCERIES");
        Transaction b = txOn(current.atDay(10), new BigDecimal("50"), false, "TRANSPORT");
        Transaction income = txOn(current.atDay(5), new BigDecimal("1500"), true, "INCOME");
        // mês anterior: 200 de saída (supermercado)
        Transaction prevTx = txOn(prev.atDay(8), new BigDecimal("200"), false, "GROCERIES");

        when(transactions.findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(anyLong(), any(), any()))
                .thenReturn(List.of(a, b, income, prevTx));

        ExpenseController.ExpenseStats stats = controller.stats(user);

        assertThat(stats.months()).hasSize(12);
        assertThat(stats.hasData()).isTrue();
        assertThat(stats.yearOutflows()).isEqualByComparingTo("350");   // 100+50+200
        assertThat(stats.yearInflows()).isEqualByComparingTo("1500");
        assertThat(stats.currentMonthOutflows()).isEqualByComparingTo("150");
        assertThat(stats.prevMonthOutflows()).isEqualByComparingTo("200");
        assertThat(stats.avgMonthlyOutflows()).isEqualByComparingTo("29.17"); // 350/12

        // top categoria: supermercado (100+200=300) à frente de transportes (50); entradas não contam
        assertThat(stats.topCategories().get(0).category()).isEqualTo("GROCERIES");
        assertThat(stats.topCategories().get(0).total()).isEqualByComparingTo("300");

        // o último ponto da série é o mês atual, com as saídas por categoria desse mês
        ExpenseController.MonthStat last = stats.months().get(11);
        assertThat(last.month()).isEqualTo(current.toString());
        assertThat(last.outflows()).isEqualByComparingTo("150");
        assertThat(last.inflows()).isEqualByComparingTo("1500");
        assertThat(last.byCategory()).extracting(ExpenseController.CategoryTotal::category)
                .containsExactly("GROCERIES", "TRANSPORT"); // ordenado por total desc (100, 50)

        // um mês sem movimentos tem categorias vazias (não null)
        assertThat(stats.months().get(0).byCategory()).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void importIgnoraDuplicadosPorContagemEAplicaRegrasDeCategoria() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));

        LocalDate day = LocalDate.of(2026, 7, 5);
        // já existe UM movimento igual na conta (mesma data, valor, sentido e descrição)
        Transaction existing = importedTx(day, new BigDecimal("45.30"), false, "Continente");
        when(transactions.findByUserIdAndAccountIdAndTxDateBetween(1L, 10L, day, day))
                .thenReturn(List.of(existing));
        // regra aprendida: qualquer "netflix" é subscrição, independentemente da categoria do ficheiro
        CategoryRule rule = mock(CategoryRule.class);
        when(rule.getMatchKey()).thenReturn("netflix");
        when(rule.getCategory()).thenReturn("SUBSCRIPTION");
        when(rules.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(rule));

        var rows = List.of(
                new ExpenseController.ImportRow(day, "Continente", new BigDecimal("45.30"), false, "GROCERIES"), // dup do existente → ignorado
                new ExpenseController.ImportRow(day, "Continente", new BigDecimal("45.30"), false, "GROCERIES"), // 2ª ocorrência → importada
                new ExpenseController.ImportRow(day, "Netflix", new BigDecimal("12.99"), false, "OTHER"));       // nova → importada (regra sobrepõe → SUBSCRIPTION)
        ExpenseController.ImportResult result = controller.importRows(user, new ExpenseController.ImportRequest(10L, rows, null));

        // multiset: o existente absorve só UMA ocorrência do ficheiro
        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.skipped()).isEqualTo(1);

        ArgumentCaptor<List<Transaction>> batchCap = ArgumentCaptor.forClass(List.class);
        verify(transactions).saveAll(batchCap.capture());
        List<Transaction> saved = batchCap.getValue();
        assertThat(saved).hasSize(2);
        assertThat(saved).extracting(Transaction::getDescription).containsExactly("Continente", "Netflix");
        assertThat(saved).extracting(Transaction::getCategory)
                .containsExactly("GROCERIES", "SUBSCRIPTION");
        assertThat(saved.get(0).getAmount()).isEqualByComparingTo("45.30");

        // extrato sem coluna de saldo (closingBalance null) → o saldo da conta fica como está
        verify(accounts, never()).save(any());
    }

    @Test
    void importPoeOSaldoDaContaNoSaldoDeFechoDoExtrato() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));

        LocalDate day = LocalDate.of(2026, 7, 31);
        var rows = List.of(new ExpenseController.ImportRow(day, "MERCADONA", new BigDecimal("5.50"), false, "GROCERIES"));
        controller.importRows(user, new ExpenseController.ImportRequest(10L, rows, new BigDecimal("213.67")));

        // é o banco a declarar o saldo: fica esse, e não o resultado de somar movimentos
        ArgumentCaptor<BigDecimal> balanceCap = ArgumentCaptor.forClass(BigDecimal.class);
        verify(account).setCurrentBalance(balanceCap.capture());
        assertThat(balanceCap.getValue()).isEqualByComparingTo("213.67");
        verify(accounts).save(account);
    }

    @Test
    void criarEApagarMovimentoAjustamOSaldoDaConta() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(account.getName()).thenReturn("Trade Republic");
        when(account.getCurrentBalance()).thenReturn(new BigDecimal("1000.00"));
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));

        var req = new ExpenseController.TransactionRequest(10L, LocalDate.of(2026, 7, 22),
                "EUREST ISEP", new BigDecimal("45.30"), false, "RESTAURANT", null);
        controller.create(user, req);

        ArgumentCaptor<BigDecimal> cap = ArgumentCaptor.forClass(BigDecimal.class);
        verify(account).setCurrentBalance(cap.capture());
        assertThat(cap.getValue()).isEqualByComparingTo("954.70"); // saída baixa o saldo

        // apagar devolve o valor ao saldo
        Transaction saved = importedTx(LocalDate.of(2026, 7, 22), new BigDecimal("45.30"), false, "EUREST ISEP");
        when(transactions.findByIdAndUserId(7L, 1L)).thenReturn(Optional.of(saved));
        controller.delete(user, 7L);

        verify(account, times(2)).setCurrentBalance(cap.capture());
        assertThat(cap.getValue()).isEqualByComparingTo("1045.30"); // 1000 + 45.30 (o saldo mockado não muda)
    }

    @Test
    void editarMovimentoNaMesmaContaAjustaOSaldoPelaDiferenca() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(account.getName()).thenReturn("Trade Republic");
        when(account.getCurrentBalance()).thenReturn(new BigDecimal("950.00"));
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));

        // saída de 50 passa a saída de 80 → o saldo só desce mais 30
        Transaction existing = importedTx(LocalDate.of(2026, 7, 10), new BigDecimal("50.00"), false, "MERCADONA");
        when(transactions.findByIdAndUserId(7L, 1L)).thenReturn(Optional.of(existing));
        var req = new ExpenseController.TransactionRequest(10L, LocalDate.of(2026, 7, 10),
                "MERCADONA", new BigDecimal("80.00"), false, "GROCERIES", null);
        controller.update(user, 7L, req);

        ArgumentCaptor<BigDecimal> cap = ArgumentCaptor.forClass(BigDecimal.class);
        verify(account).setCurrentBalance(cap.capture());
        assertThat(cap.getValue()).isEqualByComparingTo("920.00");
    }

    @Test
    void contaComSaldoPorDefinirNaoGanhaSaldoAPartirDeUmMovimento() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(account.getName()).thenReturn("Revolut");
        when(account.getCurrentBalance()).thenReturn(null); // saldo não definido
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));

        controller.create(user, new ExpenseController.TransactionRequest(10L, LocalDate.of(2026, 7, 22),
                "Compra", new BigDecimal("20.00"), false, "OTHER", null));

        // −20 não é um saldo: continua por definir até o utilizador o escrever
        verify(account, never()).setCurrentBalance(any());
        verify(accounts, never()).save(any());
    }

    @Test
    void monthAgregaEntradasSaidasNetECategoriasSoDeSaida() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(account.getName()).thenReturn("Santander");
        when(account.getCurrentBalance()).thenReturn(new BigDecimal("1000.00"));
        when(accounts.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(account));
        when(transactions.countByUserIdAndAccountId(1L, 10L)).thenReturn(3L);

        Transaction out1 = txOn(LocalDate.of(2026, 7, 3), new BigDecimal("100"), false, "GROCERIES");
        Transaction out2 = txOn(LocalDate.of(2026, 7, 10), new BigDecimal("50"), false, "TRANSPORT");
        Transaction in1 = txOn(LocalDate.of(2026, 7, 5), new BigDecimal("1500"), true, "INCOME");
        when(transactions.findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(
                1L, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31)))
                .thenReturn(List.of(out1, out2, in1));

        ExpenseController.MonthSummary summary = controller.month(user, "2026-07", null);

        assertThat(summary.month()).isEqualTo("2026-07");
        assertThat(summary.inflows()).isEqualByComparingTo("1500");
        assertThat(summary.outflows()).isEqualByComparingTo("150"); // 100 + 50
        assertThat(summary.net()).isEqualByComparingTo("1350");      // 1500 − 150
        assertThat(summary.transactions()).hasSize(3);

        // byCategory só conta saídas, ordenadas por total desc; entradas (INCOME) não entram
        assertThat(summary.byCategory()).extracting(ExpenseController.CategoryTotal::category)
                .containsExactly("GROCERIES", "TRANSPORT");
        assertThat(summary.accounts()).singleElement()
                .satisfies(a -> {
                    assertThat(a.name()).isEqualTo("Santander");
                    assertThat(a.transactionCount()).isEqualTo(3L);
                    assertThat(a.currentBalance()).isEqualByComparingTo("1000.00");
                });
    }

    @Test
    void criarMovimentoNumaContaDeOutroUtilizadorFalhaComBadRequest() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        // a conta 99 não pertence a este utilizador
        when(accounts.findByIdAndUserId(99L, 1L)).thenReturn(Optional.empty());

        var req = new ExpenseController.TransactionRequest(99L, LocalDate.of(2026, 7, 1),
                "Tentativa", new BigDecimal("10"), false, "OTHER", false);

        assertThatThrownBy(() -> controller.create(user, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void criarCategoriaGeraChaveNormalizadaEValidaCor() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        when(categories.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of()); // makeKey: nenhuma existente
        when(categories.save(any(ExpenseCategory.class))).thenAnswer(inv -> inv.getArgument(0));

        // acentos e pontuação → chave em maiúsculas sem acentos; cor inválida → cor por omissão
        var semCor = controller.createCategory(user, new ExpenseController.CategoryRequest("  Educação!  ", null));
        // cor hex válida é aceite (normalizada para minúsculas)
        var comCor = controller.createCategory(user, new ExpenseController.CategoryRequest("Ginásio", "#ABCDEF"));

        ArgumentCaptor<ExpenseCategory> cap = ArgumentCaptor.forClass(ExpenseCategory.class);
        verify(categories, times(2)).save(cap.capture());
        List<ExpenseCategory> saved = cap.getAllValues();

        assertThat(saved.get(0).getCatKey()).isEqualTo("EDUCACAO");
        assertThat(saved.get(0).getLabel()).isEqualTo("Educação!");   // label preserva o texto (trim)
        assertThat(saved.get(0).getColor()).isEqualTo("#94a3b8");     // cor por omissão
        assertThat(saved.get(1).getCatKey()).isEqualTo("GINASIO");
        assertThat(saved.get(1).getColor()).isEqualTo("#abcdef");

        assertThat(semCor.key()).isEqualTo("EDUCACAO");
        assertThat(comCor.color()).isEqualTo("#abcdef");
    }

    @Test
    void criarCategoriaComChaveJaExistenteRecebeSufixo() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        // já existe uma categoria personalizada com a chave "GINASIO"
        when(categories.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(cat("GINASIO")));
        when(categories.save(any(ExpenseCategory.class))).thenAnswer(inv -> inv.getArgument(0));

        var dto = controller.createCategory(user, new ExpenseController.CategoryRequest("Ginásio", "#22d3ee"));

        // não colide: recebe sufixo numérico
        assertThat(dto.key()).isEqualTo("GINASIO_2");
    }

    @Test
    void criarCategoriaSemNomeFalhaComBadRequest() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);

        assertThatThrownBy(() -> controller.createCategory(user, new ExpenseController.CategoryRequest("   ", "#22d3ee")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        verify(categories, times(0)).save(any());
    }

    @Test
    void movimentoAceitaCategoriaPersonalizadaDoUtilizadorERejeitaDesconhecida() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        Account account = mock(Account.class);
        when(account.getId()).thenReturn(10L);
        when(account.getName()).thenReturn("Santander");
        when(accounts.findByIdAndUserId(10L, 1L)).thenReturn(Optional.of(account));
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));
        // "EDUCACAO" é uma categoria personalizada do utilizador; "BOGUS" não existe
        when(categories.findByUserIdAndCatKey(1L, "EDUCACAO")).thenReturn(Optional.of(cat("EDUCACAO")));
        when(categories.findByUserIdAndCatKey(1L, "BOGUS")).thenReturn(Optional.empty());

        var okReq = new ExpenseController.TransactionRequest(10L, LocalDate.of(2026, 7, 15),
                "Explicações", new BigDecimal("40"), false, "EDUCACAO", false);
        var badReq = new ExpenseController.TransactionRequest(10L, LocalDate.of(2026, 7, 16),
                "Coisa", new BigDecimal("5"), false, "BOGUS", false);

        assertThat(controller.create(user, okReq).category()).isEqualTo("EDUCACAO");
        // categoria inexistente (ou de outro utilizador) → OTHER
        assertThat(controller.create(user, badReq).category()).isEqualTo("OTHER");
    }

    @Test
    @SuppressWarnings("unchecked")
    void eliminarCategoriaReatribuiMovimentosAOutrosERemoveRegras() {
        ExpenseController controller = new ExpenseController(accounts, transactions, rules, categories);
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);

        ExpenseCategory ginasio = cat("GINASIO");
        when(categories.findByIdAndUserId(5L, 1L)).thenReturn(Optional.of(ginasio));

        Transaction doGinasio = txOn(LocalDate.of(2026, 7, 1), new BigDecimal("30"), false, "GINASIO");
        Transaction outra = txOn(LocalDate.of(2026, 7, 2), new BigDecimal("10"), false, "GROCERIES");
        when(transactions.findByUserId(1L)).thenReturn(List.of(doGinasio, outra));

        CategoryRule regraGinasio = ruleWith("GINASIO");
        CategoryRule regraOutra = ruleWith("GROCERIES");
        when(rules.findByUserIdOrderByIdAsc(1L)).thenReturn(List.of(regraGinasio, regraOutra));

        controller.deleteCategory(user, 5L);

        // só os movimentos da categoria eliminada passam a OTHER; os restantes ficam intactos
        assertThat(doGinasio.getCategory()).isEqualTo("OTHER");
        assertThat(outra.getCategory()).isEqualTo("GROCERIES");
        ArgumentCaptor<List<Transaction>> savedCap = ArgumentCaptor.forClass(List.class);
        verify(transactions).saveAll(savedCap.capture());
        assertThat(savedCap.getValue()).containsExactly(doGinasio);

        // só as regras que apontavam para a categoria eliminada são removidas
        ArgumentCaptor<List<CategoryRule>> delCap = ArgumentCaptor.forClass(List.class);
        verify(rules).deleteAll(delCap.capture());
        assertThat(delCap.getValue()).containsExactly(regraGinasio);

        verify(categories).delete(ginasio);
    }

    private ExpenseCategory cat(String key) {
        ExpenseCategory c = new ExpenseCategory();
        c.setUserId(1L);
        c.setCatKey(key);
        c.setLabel(key);
        c.setColor("#000000");
        return c;
    }

    private CategoryRule ruleWith(String category) {
        CategoryRule r = new CategoryRule();
        r.setUserId(1L);
        r.setMatchKey("chave-" + category);
        r.setCategory(category);
        return r;
    }

    private Transaction importedTx(LocalDate date, BigDecimal amount, boolean inflow, String description) {
        Transaction t = new Transaction();
        t.setUserId(1L);
        t.setAccountId(10L);
        t.setTxDate(date);
        t.setDescription(description);
        t.setAmount(amount);
        t.setInflow(inflow);
        t.setCategory("OTHER");
        return t;
    }

    private Transaction txOn(LocalDate date, BigDecimal amount, boolean inflow, String category) {
        Transaction t = new Transaction();
        t.setUserId(1L);
        t.setAccountId(10L);
        t.setTxDate(date);
        t.setDescription("mov");
        t.setAmount(amount);
        t.setInflow(inflow);
        t.setCategory(category);
        return t;
    }

    private Transaction tx(String description, String category) {
        Transaction t = new Transaction();
        t.setUserId(1L);
        t.setAccountId(10L);
        t.setTxDate(LocalDate.of(2026, 3, 1));
        t.setDescription(description);
        t.setAmount(new BigDecimal("10"));
        t.setInflow(false);
        t.setCategory(category);
        return t;
    }
}
