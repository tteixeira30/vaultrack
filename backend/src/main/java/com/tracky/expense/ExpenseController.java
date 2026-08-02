package com.tracky.expense;

import com.tracky.auth.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
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
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Despesas e contas correntes: CRUD de contas, movimentos manuais e importação
 * de extratos bancários (o frontend faz o parse do ficheiro; aqui recebem-se
 * as linhas já estruturadas e evita-se a duplicação de movimentos).
 */
@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {

    /** Chaves das categorias por omissão — têm de acompanhar categories.js no frontend. */
    static final Set<String> DEFAULT_KEYS = Set.of(
            "INCOME", "GROCERIES", "RESTAURANT", "TRANSPORT", "HOUSING", "SUBSCRIPTION",
            "SHOPPING", "HEALTH", "LEISURE", "TRANSFER", "OTHER");

    private static final String DEFAULT_COLOR = "#94a3b8";

    private final AccountRepository accounts;
    private final TransactionRepository transactions;
    private final CategoryRuleRepository rules;
    private final ExpenseCategoryRepository categories;

    public ExpenseController(AccountRepository accounts, TransactionRepository transactions,
                             CategoryRuleRepository rules, ExpenseCategoryRepository categories) {
        this.accounts = accounts;
        this.transactions = transactions;
        this.rules = rules;
        this.categories = categories;
    }

    /** currentBalance opcional, em EUR; null = limpar/não definido. */
    public record AccountRequest(@NotBlank String name, BigDecimal currentBalance) {}
    public record AccountDto(Long id, String name, long transactionCount, BigDecimal currentBalance) {}
    /** applyToSimilar: aplica a categoria a todos os movimentos com a mesma descrição e memoriza como regra. */
    public record TransactionRequest(@NotNull Long accountId, @NotNull LocalDate date, @NotBlank String description,
                                     @NotNull @Positive BigDecimal amount, boolean inflow, String category,
                                     Boolean applyToSimilar) {}
    public record RuleDto(Long id, String matchKey, String category) {}
    /** Categoria personalizada do utilizador (as por omissão não têm entidade). */
    public record CategoryDto(Long id, String key, String label, String color) {}
    public record CategoryRequest(@NotBlank String label, String color) {}
    public record TransactionDto(Long id, Long accountId, String accountName, LocalDate date, String description,
                                 BigDecimal amount, boolean inflow, String category) {}
    public record ImportRow(@NotNull LocalDate date, @NotBlank String description,
                            @NotNull @Positive BigDecimal amount, boolean inflow, String category) {}
    /** closingBalance: saldo da conta no fim do extrato, em EUR; null quando o extrato não o traz. */
    public record ImportRequest(@NotNull Long accountId, @NotEmpty List<@Valid ImportRow> rows,
                                BigDecimal closingBalance) {}
    public record ImportResult(int imported, int skipped, BigDecimal balance) {}
    public record CategoryTotal(String category, BigDecimal total) {}
    public record MonthSummary(String month, BigDecimal inflows, BigDecimal outflows, BigDecimal net,
                               List<CategoryTotal> byCategory, List<AccountDto> accounts,
                               List<TransactionDto> transactions) {}
    /** Entradas/saídas de um mês (+ saídas por categoria) para as séries anuais e o detalhe do painel. */
    public record MonthStat(String month, BigDecimal outflows, BigDecimal inflows, BigDecimal net,
                            List<CategoryTotal> byCategory) {}
    public record ExpenseStats(List<MonthStat> months, BigDecimal yearOutflows, BigDecimal yearInflows,
                               BigDecimal avgMonthlyOutflows, BigDecimal currentMonthOutflows,
                               BigDecimal prevMonthOutflows, List<CategoryTotal> topCategories, boolean hasData) {}

    // ---------- Contas ----------

    @GetMapping("/accounts")
    public List<AccountDto> listAccounts(@AuthenticationPrincipal User user) {
        return accounts.findByUserIdOrderByIdAsc(user.getId()).stream().map(a -> toDto(user, a)).toList();
    }

    @PostMapping("/accounts")
    public AccountDto createAccount(@AuthenticationPrincipal User user, @Valid @RequestBody AccountRequest req) {
        Account a = new Account();
        a.setUserId(user.getId());
        a.setName(req.name().trim());
        a.setCurrentBalance(roundBalance(req.currentBalance()));
        return toDto(user, accounts.save(a));
    }

    @PutMapping("/accounts/{id}")
    public AccountDto updateAccount(@AuthenticationPrincipal User user, @PathVariable Long id,
                                    @Valid @RequestBody AccountRequest req) {
        Account a = accounts.findByIdAndUserId(id, user.getId()).orElseThrow();
        a.setName(req.name().trim());
        a.setCurrentBalance(roundBalance(req.currentBalance()));
        return toDto(user, accounts.save(a));
    }

    /** Elimina a conta e todos os movimentos associados. */
    @DeleteMapping("/accounts/{id}")
    @Transactional
    public void deleteAccount(@AuthenticationPrincipal User user, @PathVariable Long id) {
        accounts.findByIdAndUserId(id, user.getId()).ifPresent(a -> {
            transactions.deleteByUserIdAndAccountId(user.getId(), a.getId());
            accounts.delete(a);
        });
    }

    // ---------- Movimentos ----------

    @GetMapping
    public MonthSummary month(@AuthenticationPrincipal User user,
                              @RequestParam(required = false) String month,
                              @RequestParam(required = false) Long accountId) {
        YearMonth ym = parseMonth(month);
        LocalDate from = ym.atDay(1), to = ym.atEndOfMonth();

        Map<Long, String> accountNames = new HashMap<>();
        List<AccountDto> accountDtos = accounts.findByUserIdOrderByIdAsc(user.getId()).stream()
                .peek(a -> accountNames.put(a.getId(), a.getName()))
                .map(a -> toDto(user, a)).toList();

        List<Transaction> txs = transactions.findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(user.getId(), from, to);
        if (accountId != null) txs = txs.stream().filter(t -> accountId.equals(t.getAccountId())).toList();

        BigDecimal in = BigDecimal.ZERO, out = BigDecimal.ZERO;
        Map<String, BigDecimal> byCategory = new LinkedHashMap<>();
        for (Transaction t : txs) {
            if (t.isInflow()) in = in.add(t.getAmount());
            else {
                out = out.add(t.getAmount());
                byCategory.merge(t.getCategory(), t.getAmount(), BigDecimal::add);
            }
        }
        List<CategoryTotal> categories = byCategory.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .map(e -> new CategoryTotal(e.getKey(), e.getValue())).toList();

        return new MonthSummary(ym.toString(), in, out, in.subtract(out), categories, accountDtos,
                txs.stream().map(t -> toDto(t, accountNames)).toList());
    }

    /**
     * Estatísticas de despesas dos últimos 12 meses (mês a mês) para o painel:
     * série mensal de entradas/saídas, total e média do ano, mês atual vs anterior
     * e as principais categorias do período. Tudo em EUR.
     */
    @GetMapping("/stats")
    public ExpenseStats stats(@AuthenticationPrincipal User user) {
        YearMonth current = YearMonth.now();
        YearMonth start = current.minusMonths(11);
        LocalDate from = start.atDay(1), to = current.atEndOfMonth();

        // buckets para os 12 meses da janela, mesmo os que não têm movimentos
        Map<String, BigDecimal> outByMonth = new LinkedHashMap<>();
        Map<String, BigDecimal> inByMonth = new LinkedHashMap<>();
        for (int i = 0; i < 12; i++) {
            String key = start.plusMonths(i).toString();
            outByMonth.put(key, BigDecimal.ZERO);
            inByMonth.put(key, BigDecimal.ZERO);
        }

        Map<String, BigDecimal> byCategory = new LinkedHashMap<>();
        Map<String, Map<String, BigDecimal>> catByMonth = new HashMap<>();
        BigDecimal yearOut = BigDecimal.ZERO, yearIn = BigDecimal.ZERO;
        for (Transaction t : transactions.findByUserIdAndTxDateBetweenOrderByTxDateDescIdDesc(user.getId(), from, to)) {
            String key = YearMonth.from(t.getTxDate()).toString();
            if (t.isInflow()) {
                inByMonth.merge(key, t.getAmount(), BigDecimal::add);
                yearIn = yearIn.add(t.getAmount());
            } else {
                outByMonth.merge(key, t.getAmount(), BigDecimal::add);
                yearOut = yearOut.add(t.getAmount());
                byCategory.merge(t.getCategory(), t.getAmount(), BigDecimal::add);
                catByMonth.computeIfAbsent(key, k -> new HashMap<>())
                        .merge(t.getCategory(), t.getAmount(), BigDecimal::add);
            }
        }

        List<MonthStat> months = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            String key = start.plusMonths(i).toString();
            BigDecimal out = outByMonth.get(key), in = inByMonth.get(key);
            months.add(new MonthStat(key, out, in, in.subtract(out), sortedCategories(catByMonth.get(key))));
        }

        BigDecimal avg = yearOut.divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP);
        List<CategoryTotal> topCategories = sortedCategories(byCategory).stream().limit(5).toList();

        return new ExpenseStats(months, yearOut, yearIn, avg,
                outByMonth.get(current.toString()), outByMonth.get(current.minusMonths(1).toString()),
                topCategories, yearOut.signum() > 0 || yearIn.signum() > 0);
    }

    @PostMapping("/transactions")
    @Transactional
    public TransactionDto create(@AuthenticationPrincipal User user, @Valid @RequestBody TransactionRequest req) {
        Account a = requireAccount(user, req.accountId());
        Transaction t = new Transaction();
        t.setUserId(user.getId());
        t.setAccountId(a.getId());
        apply(user, t, req);
        TransactionDto dto = toDto(transactions.save(t), Map.of(a.getId(), a.getName()));
        shiftBalance(a, effect(t.getAmount(), t.isInflow()));
        if (Boolean.TRUE.equals(req.applyToSimilar())) applyCategoryRule(user, t.getDescription(), t.getCategory());
        return dto;
    }

    @PutMapping("/transactions/{id}")
    @Transactional
    public TransactionDto update(@AuthenticationPrincipal User user, @PathVariable Long id,
                                 @Valid @RequestBody TransactionRequest req) {
        Transaction t = transactions.findByIdAndUserId(id, user.getId()).orElseThrow();
        Long fromAccountId = t.getAccountId();
        BigDecimal before = effect(t.getAmount(), t.isInflow());

        Account a = requireAccount(user, req.accountId());
        t.setAccountId(a.getId());
        apply(user, t, req);
        TransactionDto dto = toDto(transactions.save(t), Map.of(a.getId(), a.getName()));

        // saldo: desfaz o efeito antigo e aplica o novo. Na mesma conta é um só
        // ajuste (a diferença) — carregar a conta duas vezes arriscava que a
        // segunda gravação apagasse a primeira.
        BigDecimal after = effect(t.getAmount(), t.isInflow());
        if (Objects.equals(fromAccountId, a.getId())) {
            shiftBalance(a, after.subtract(before));
        } else {
            accounts.findByIdAndUserId(fromAccountId, user.getId()).ifPresent(from -> shiftBalance(from, before.negate()));
            shiftBalance(a, after);
        }

        if (Boolean.TRUE.equals(req.applyToSimilar())) applyCategoryRule(user, t.getDescription(), t.getCategory());
        return dto;
    }

    // ---------- Regras de categorização ----------

    @GetMapping("/rules")
    public List<RuleDto> listRules(@AuthenticationPrincipal User user) {
        return rules.findByUserIdOrderByIdAsc(user.getId()).stream()
                .map(r -> new RuleDto(r.getId(), r.getMatchKey(), r.getCategory())).toList();
    }

    @DeleteMapping("/rules/{id}")
    public void deleteRule(@AuthenticationPrincipal User user, @PathVariable Long id) {
        rules.findByIdAndUserId(id, user.getId()).ifPresent(rules::delete);
    }

    /**
     * Memoriza a regra descrição→categoria e propaga a categoria a todos os
     * movimentos do utilizador com a mesma descrição normalizada.
     */
    private void applyCategoryRule(User user, String description, String category) {
        String key = categoryKey(description);
        if (key.isEmpty()) return;

        CategoryRule rule = rules.findByUserIdAndMatchKey(user.getId(), key).orElseGet(() -> {
            CategoryRule r = new CategoryRule();
            r.setUserId(user.getId());
            r.setMatchKey(key);
            return r;
        });
        rule.setCategory(category);
        rules.save(rule);

        List<Transaction> toUpdate = transactions.findByUserId(user.getId()).stream()
                .filter(t -> key.equals(categoryKey(t.getDescription())) && !category.equals(t.getCategory()))
                .peek(t -> t.setCategory(category))
                .toList();
        transactions.saveAll(toUpdate);
    }

    @DeleteMapping("/transactions/{id}")
    @Transactional
    public void delete(@AuthenticationPrincipal User user, @PathVariable Long id) {
        transactions.findByIdAndUserId(id, user.getId()).ifPresent(t -> {
            transactions.delete(t);
            accounts.findByIdAndUserId(t.getAccountId(), user.getId())
                    .ifPresent(a -> shiftBalance(a, effect(t.getAmount(), t.isInflow()).negate()));
        });
    }

    // ---------- Categorias personalizadas ----------

    @GetMapping("/categories")
    public List<CategoryDto> listCategories(@AuthenticationPrincipal User user) {
        return categories.findByUserIdOrderByIdAsc(user.getId()).stream().map(ExpenseController::toDto).toList();
    }

    @PostMapping("/categories")
    public CategoryDto createCategory(@AuthenticationPrincipal User user, @Valid @RequestBody CategoryRequest req) {
        String label = req.label() == null ? "" : req.label().trim();
        if (label.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica o nome da categoria.");
        ExpenseCategory c = new ExpenseCategory();
        c.setUserId(user.getId());
        c.setCatKey(makeKey(user, label));
        c.setLabel(truncateLabel(label));
        c.setColor(normalizeColor(req.color()));
        return toDto(categories.save(c));
    }

    @PutMapping("/categories/{id}")
    public CategoryDto updateCategory(@AuthenticationPrincipal User user, @PathVariable Long id,
                                      @Valid @RequestBody CategoryRequest req) {
        ExpenseCategory c = categories.findByIdAndUserId(id, user.getId()).orElseThrow();
        String label = req.label() == null ? "" : req.label().trim();
        if (label.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica o nome da categoria.");
        c.setLabel(truncateLabel(label));
        c.setColor(normalizeColor(req.color()));
        return toDto(categories.save(c));
    }

    /**
     * Elimina uma categoria personalizada: os movimentos e regras que a usavam
     * passam a "OTHER" (as categorias por omissão não podem ser eliminadas).
     */
    @DeleteMapping("/categories/{id}")
    @Transactional
    public void deleteCategory(@AuthenticationPrincipal User user, @PathVariable Long id) {
        categories.findByIdAndUserId(id, user.getId()).ifPresent(c -> {
            String key = c.getCatKey();
            List<Transaction> affected = transactions.findByUserId(user.getId()).stream()
                    .filter(t -> key.equals(t.getCategory()))
                    .peek(t -> t.setCategory("OTHER"))
                    .toList();
            transactions.saveAll(affected);
            List<CategoryRule> ruleHits = rules.findByUserIdOrderByIdAsc(user.getId()).stream()
                    .filter(r -> key.equals(r.getCategory()))
                    .toList();
            rules.deleteAll(ruleHits);
            categories.delete(c);
        });
    }

    /**
     * Importa linhas de um extrato já estruturadas pelo frontend. Movimentos que já
     * existam na conta (mesma data, valor, sentido e descrição) são ignorados, para
     * que reimportar o mesmo extrato — ou extratos com meses sobrepostos — seja seguro.
     * A comparação é por contagem (multiset): um extrato pode ter movimentos
     * legitimamente idênticos (ex.: duas compras iguais no mesmo dia) e cada
     * ocorrência já existente na conta só absorve uma ocorrência do ficheiro.
     *
     * O saldo da conta passa a ser o do fim do extrato, quando o ficheiro o traz —
     * é o banco a dizer o saldo, o que é mais fiável do que somar movimentos (somar
     * duplicaria num extrato de um período já refletido no saldo). Extratos sem
     * coluna de saldo deixam o saldo como está.
     */
    @PostMapping("/import")
    @Transactional
    public ImportResult importRows(@AuthenticationPrincipal User user, @Valid @RequestBody ImportRequest req) {
        Account a = requireAccount(user, req.accountId());

        LocalDate min = req.rows().stream().map(ImportRow::date).min(LocalDate::compareTo).orElseThrow();
        LocalDate max = req.rows().stream().map(ImportRow::date).max(LocalDate::compareTo).orElseThrow();
        Map<String, Integer> existing = new HashMap<>();
        for (Transaction t : transactions.findByUserIdAndAccountIdAndTxDateBetween(user.getId(), a.getId(), min, max)) {
            existing.merge(dedupeKey(t.getTxDate(), t.getAmount(), t.isInflow(), t.getDescription()), 1, Integer::sum);
        }

        // regras de categorização aprendidas têm prioridade sobre a categoria vinda do frontend
        Map<String, String> ruleMap = new HashMap<>();
        for (CategoryRule r : rules.findByUserIdOrderByIdAsc(user.getId())) ruleMap.put(r.getMatchKey(), r.getCategory());

        int imported = 0, skipped = 0;
        List<Transaction> batch = new ArrayList<>();
        for (ImportRow row : req.rows()) {
            String key = dedupeKey(row.date(), row.amount(), row.inflow(), row.description());
            Integer remaining = existing.get(key);
            if (remaining != null && remaining > 0) {
                existing.put(key, remaining - 1);
                skipped++;
                continue;
            }
            Transaction t = new Transaction();
            t.setUserId(user.getId());
            t.setAccountId(a.getId());
            t.setTxDate(row.date());
            t.setDescription(truncate(row.description().trim()));
            t.setAmount(row.amount().setScale(2, RoundingMode.HALF_UP));
            t.setInflow(row.inflow());
            String ruled = ruleMap.get(categoryKey(row.description()));
            t.setCategory(ruled != null ? ruled : resolveCategory(user, row.category()));
            batch.add(t);
            imported++;
        }
        transactions.saveAll(batch);

        // ao contrário do shiftBalance, aqui até uma conta sem saldo definido o ganha:
        // não é um valor deduzido de movimentos, é o saldo que o banco declara
        if (req.closingBalance() != null) {
            a.setCurrentBalance(roundBalance(req.closingBalance()));
            accounts.save(a);
        }
        return new ImportResult(imported, skipped, a.getCurrentBalance());
    }

    // ---------- Helpers ----------

    /** Categorias ordenadas por total decrescente; null/vazio → lista vazia. */
    private static List<CategoryTotal> sortedCategories(Map<String, BigDecimal> byCategory) {
        if (byCategory == null || byCategory.isEmpty()) return List.of();
        return byCategory.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .map(e -> new CategoryTotal(e.getKey(), e.getValue())).toList();
    }

    private Account requireAccount(User user, Long accountId) {
        return accounts.findByIdAndUserId(accountId, user.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conta inexistente."));
    }

    private void apply(User user, Transaction t, TransactionRequest req) {
        t.setTxDate(req.date());
        t.setDescription(truncate(req.description().trim()));
        t.setAmount(req.amount().setScale(2, RoundingMode.HALF_UP));
        t.setInflow(req.inflow());
        t.setCategory(resolveCategory(user, req.category()));
    }

    /** Efeito de um movimento no saldo: entradas somam, saídas subtraem. */
    private static BigDecimal effect(BigDecimal amount, boolean inflow) {
        return inflow ? amount : amount.negate();
    }

    /**
     * Aplica ao saldo da conta o efeito de um movimento (positivo entra, negativo sai).
     * Contas com saldo por definir ficam como estão: null é "não definido" e não deve
     * virar um saldo inventado a partir de um único movimento — o utilizador tem de o
     * escrever primeiro (ou importar um extrato, que traz o saldo real do banco).
     */
    private void shiftBalance(Account a, BigDecimal delta) {
        if (a.getCurrentBalance() == null || delta.signum() == 0) return;
        a.setCurrentBalance(roundBalance(a.getCurrentBalance().add(delta)));
        accounts.save(a);
    }

    private static YearMonth parseMonth(String month) {
        if (month == null || month.isBlank()) return YearMonth.now();
        try {
            return YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mês inválido (usa AAAA-MM).");
        }
    }

    /**
     * Resolve a chave de categoria vinda do cliente: aceita as categorias por
     * omissão e as personalizadas do próprio utilizador; qualquer outra cai em
     * "OTHER" (defensivo contra chaves inválidas ou de outro utilizador).
     */
    private String resolveCategory(User user, String category) {
        if (category == null || category.isBlank()) return "OTHER";
        String c = category.trim();
        if (DEFAULT_KEYS.contains(c)) return c;
        if (categories.findByUserIdAndCatKey(user.getId(), c).isPresent()) return c;
        return "OTHER";
    }

    private static String truncate(String s) {
        return s.length() > 500 ? s.substring(0, 500) : s;
    }

    private static String truncateLabel(String s) {
        return s.length() > 60 ? s.substring(0, 60) : s;
    }

    /** Aceita uma cor hex #rrggbb; qualquer outra coisa cai na cor por omissão. */
    private static String normalizeColor(String color) {
        if (color == null) return DEFAULT_COLOR;
        String c = color.trim();
        return c.matches("#[0-9a-fA-F]{6}") ? c.toLowerCase(Locale.ROOT) : DEFAULT_COLOR;
    }

    /**
     * Gera uma chave estável e única (por utilizador) a partir do nome: sem acentos,
     * maiúsculas, só letras/dígitos (o resto vira "_"). Evita colidir com as chaves
     * por omissão e com outras categorias do mesmo utilizador.
     */
    private String makeKey(User user, String label) {
        String base = java.text.Normalizer.normalize(label, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (base.isEmpty()) base = "CAT";
        if (base.length() > 50) base = base.substring(0, 50);

        Set<String> taken = new HashSet<>(DEFAULT_KEYS);
        categories.findByUserIdOrderByIdAsc(user.getId()).forEach(c -> taken.add(c.getCatKey()));
        String key = base;
        int n = 2;
        while (taken.contains(key)) key = base + "_" + n++;
        return key;
    }

    private static CategoryDto toDto(ExpenseCategory c) {
        return new CategoryDto(c.getId(), c.getCatKey(), c.getLabel(), c.getColor());
    }

    /** Normalização de descrições para dedupe (comparação exata entre movimentos). */
    private static String normalizeDesc(String description) {
        return description == null ? "" : description.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    /**
     * Chave de categorização: identifica o "comerciante" da descrição ignorando as
     * partes variáveis (referências, datas, valores, pontuação), para que a mesma
     * regra apanhe movimentos do mesmo sítio mesmo com números diferentes.
     * NÃO usar no dedupe — só para regras de categoria. Tem de ser idêntica à versão
     * do frontend (categoryKey em statementParser.js).
     */
    static String categoryKey(String description) {
        if (description == null) return "";
        return description.toLowerCase(java.util.Locale.ROOT)
                .replaceAll("\\d+", " ")            // referências, datas, valores
                .replaceAll("[^\\p{L}\\s]", " ")    // pontuação e símbolos
                .replaceAll("\\s+", " ").trim();    // colapsa espaços
    }

    private static String dedupeKey(LocalDate date, BigDecimal amount, boolean inflow, String description) {
        return date + "|" + amount.setScale(2, RoundingMode.HALF_UP).toPlainString() + "|" + inflow + "|" + normalizeDesc(description);
    }

    /** Arredonda o saldo a 2 casas decimais; null passa (saldo "não definido"). */
    private static BigDecimal roundBalance(BigDecimal balance) {
        return balance == null ? null : balance.setScale(2, RoundingMode.HALF_UP);
    }

    private AccountDto toDto(User user, Account a) {
        return new AccountDto(a.getId(), a.getName(), transactions.countByUserIdAndAccountId(user.getId(), a.getId()),
                a.getCurrentBalance());
    }

    private static TransactionDto toDto(Transaction t, Map<Long, String> accountNames) {
        return new TransactionDto(t.getId(), t.getAccountId(), accountNames.get(t.getAccountId()), t.getTxDate(),
                t.getDescription(), t.getAmount(), t.isInflow(), t.getCategory());
    }
}
