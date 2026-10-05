package com.tracky.income;

import com.tracky.audit.AuditEntity;
import com.tracky.audit.AuditService;
import org.springframework.beans.factory.annotation.Autowired;
import com.tracky.auth.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

interface IncomeSettingsRepository extends JpaRepository<IncomeSettings, Long> {
    // devolve lista (não Optional) por não haver constraint única em (user_id, month):
    // linhas duplicadas — ex: escritas concorrentes num mês novo — não podem rebentar a leitura
    List<IncomeSettings> findByUserIdAndMonthOrderByIdAsc(Long userId, String month);
    List<IncomeSettings> findByUserIdOrderByMonthAsc(Long userId);
    List<IncomeSettings> findByUserIdAndMonthIsNull(Long userId);
}

interface AllocationRepository extends JpaRepository<Allocation, Long> {
    List<Allocation> findByUserIdAndMonthOrderByIdAsc(Long userId, String month);
    List<Allocation> findByUserIdAndMonthIsNull(Long userId);
    Optional<Allocation> findByIdAndUserId(Long id, Long userId);
}

interface AllocationItemRepository extends JpaRepository<AllocationItem, Long> {
    List<AllocationItem> findByAllocationIdOrderByIdAsc(Long allocationId);
    List<AllocationItem> findByUserIdAndAllocationIdInOrderByIdAsc(Long userId, List<Long> allocationIds);
    Optional<AllocationItem> findByIdAndUserId(Long id, Long userId);
}

@RestController
@RequestMapping("/api/income")
public class IncomeController {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final IncomeSettingsRepository incomeRepo;
    private final AllocationRepository allocationRepo;
    private final AllocationItemRepository itemRepo;

    public IncomeController(IncomeSettingsRepository incomeRepo, AllocationRepository allocationRepo,
                            AllocationItemRepository itemRepo) {
        this.incomeRepo = incomeRepo;
        this.allocationRepo = allocationRepo;
        this.itemRepo = itemRepo;
    }

    private AuditService audit = AuditService.NOOP;

    @Autowired
    void setAudit(AuditService audit) {
        this.audit = audit;
    }

    public record AllocationItemDto(Long id, String name, BigDecimal amount) {}
    public record AllocationDto(Long id, String name, BigDecimal percentage, BigDecimal fixedAmount,
                                BigDecimal amount, BigDecimal effectivePercentage,
                                List<AllocationItemDto> items, BigDecimal itemsTotal, String color) {}
    public record IncomeResponse(String month, boolean current, BigDecimal monthlyIncome,
                                 List<AllocationDto> allocations, BigDecimal totalAllocated,
                                 BigDecimal totalPercentage, BigDecimal unallocated,
                                 List<String> availableMonths, String copiedFrom) {}
    public record IncomeRequest(@NotNull BigDecimal monthlyIncome) {}
    /** Ou percentage ou fixedAmount — exatamente um dos dois. color é opcional (hex). */
    public record AllocationRequest(@NotBlank @Size(max = 100, message = "O nome não pode ter mais de 100 caracteres.") String name, BigDecimal percentage, BigDecimal fixedAmount,
                                    @Size(max = 20, message = "Cor inválida.") String color) {}
    public record AllocationItemRequest(@NotBlank @Size(max = 100, message = "O nome não pode ter mais de 100 caracteres.") String name, @NotNull BigDecimal amount) {}

    // ---------- helpers ----------

    private String currentMonth() {
        return YearMonth.now().toString();
    }

    private String normalizeMonth(String month) {
        if (month == null || month.isBlank()) return currentMonth();
        try {
            return YearMonth.parse(month.trim()).toString();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mês inválido — usa o formato AAAA-MM.");
        }
    }

    /** Dados antigos (antes do rendimento mensal) não tinham mês: passam a pertencer ao mês atual. */
    private void migrateLegacyRows(User user) {
        String current = currentMonth();
        incomeRepo.findByUserIdAndMonthIsNull(user.getId()).forEach(s -> {
            s.setMonth(current);
            incomeRepo.save(s);
        });
        allocationRepo.findByUserIdAndMonthIsNull(user.getId()).forEach(a -> {
            a.setMonth(current);
            allocationRepo.save(a);
        });
    }

    /** Mês mais recente com dados, anterior ao mês dado. */
    private Optional<IncomeSettings> latestBefore(Long userId, String month) {
        return incomeRepo.findByUserIdOrderByMonthAsc(userId).stream()
                .filter(s -> s.getMonth() != null && s.getMonth().compareTo(month) < 0)
                .reduce((first, second) -> second);
    }

    /**
     * Rendimento de um mês, tolerante a duplicados. Como não há constraint única em
     * (user_id, month), duas escritas concorrentes podem criar linhas repetidas; aqui
     * ficamos com a primeira e removemos as restantes (auto-limpeza, à semelhança de
     * migrateLegacyRows) para a leitura nunca rebentar.
     */
    private Optional<IncomeSettings> findSettings(Long userId, String month) {
        List<IncomeSettings> rows = incomeRepo.findByUserIdAndMonthOrderByIdAsc(userId, month);
        if (rows.isEmpty()) return Optional.empty();
        if (rows.size() > 1) incomeRepo.deleteAll(rows.subList(1, rows.size()));
        return Optional.of(rows.get(0));
    }

    private IncomeSettings getOrCreate(User user, String month) {
        return findSettings(user.getId(), month).orElseGet(() -> {
            IncomeSettings s = new IncomeSettings();
            s.setUserId(user.getId());
            s.setMonth(month);
            return incomeRepo.save(s);
        });
    }

    // ---------- endpoints ----------

    @GetMapping
    public IncomeResponse get(@AuthenticationPrincipal User user,
                              @RequestParam(required = false) String month) {
        migrateLegacyRows(user);
        String m = normalizeMonth(month);
        String current = currentMonth();
        String copiedFrom = null;

        Optional<IncomeSettings> existing = findSettings(user.getId(), m);

        // ao entrar num mês novo (o atual), arranca com as categorias e o rendimento do mês anterior
        if (existing.isEmpty() && m.equals(current)) {
            Optional<IncomeSettings> previous = latestBefore(user.getId(), m);
            IncomeSettings s = new IncomeSettings();
            s.setUserId(user.getId());
            s.setMonth(m);
            if (previous.isPresent()) {
                s.setMonthlyIncome(previous.get().getMonthlyIncome());
                List<Allocation> prevAllocs =
                        allocationRepo.findByUserIdAndMonthOrderByIdAsc(user.getId(), previous.get().getMonth());
                for (Allocation a : prevAllocs) {
                    Allocation copy = new Allocation();
                    copy.setUserId(user.getId());
                    copy.setMonth(m);
                    copy.setName(a.getName());
                    copy.setPercentage(a.getPercentage());
                    copy.setFixedAmount(a.getFixedAmount());
                    copy.setColor(a.getColor());
                    allocationRepo.save(copy);
                    // os itens (ex: subscrições) recorrem — copia-os para o novo mês
                    for (AllocationItem it : itemRepo.findByAllocationIdOrderByIdAsc(a.getId())) {
                        AllocationItem itCopy = new AllocationItem();
                        itCopy.setUserId(user.getId());
                        itCopy.setAllocationId(copy.getId());
                        itCopy.setName(it.getName());
                        itCopy.setAmount(it.getAmount());
                        itemRepo.save(itCopy);
                    }
                }
                if (!prevAllocs.isEmpty()) copiedFrom = previous.get().getMonth();
            }
            incomeRepo.save(s);
            existing = Optional.of(s);
        }

        return buildResponse(user, m, existing.orElse(null), copiedFrom);
    }

    @PutMapping
    public IncomeResponse setIncome(@AuthenticationPrincipal User user,
                                    @RequestParam(required = false) String month,
                                    @Valid @RequestBody IncomeRequest req) {
        migrateLegacyRows(user);
        String m = normalizeMonth(month);
        IncomeSettings s = getOrCreate(user, m);
        BigDecimal before = s.getMonthlyIncome();
        s.setMonthlyIncome(req.monthlyIncome());
        incomeRepo.save(s);
        audit.updated(user.getId(), AuditEntity.INCOME, s.getId(), m,
                AuditService.fields("monthlyIncome", before), AuditService.fields("monthlyIncome", s.getMonthlyIncome()));
        return get(user, m);
    }

    @PostMapping("/allocations")
    public IncomeResponse addAllocation(@AuthenticationPrincipal User user,
                                        @RequestParam(required = false) String month,
                                        @Valid @RequestBody AllocationRequest req) {
        migrateLegacyRows(user);
        String m = normalizeMonth(month);
        validate(req);
        getOrCreate(user, m); // garante que o mês existe
        Allocation a = new Allocation();
        a.setUserId(user.getId());
        a.setMonth(m);
        apply(a, req);
        allocationRepo.save(a);
        audit.created(user.getId(), AuditEntity.ALLOCATION, a.getId(), a.getName(), auditFields(a));
        return get(user, m);
    }

    @PutMapping("/allocations/{id}")
    public IncomeResponse updateAllocation(@AuthenticationPrincipal User user, @PathVariable Long id,
                                           @Valid @RequestBody AllocationRequest req) {
        validate(req);
        Allocation a = allocationRepo.findByIdAndUserId(id, user.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria não encontrada."));
        var before = auditFields(a);
        apply(a, req);
        allocationRepo.save(a);
        audit.updated(user.getId(), AuditEntity.ALLOCATION, a.getId(), a.getName(), before, auditFields(a));
        return get(user, a.getMonth());
    }

    @DeleteMapping("/allocations/{id}")
    public IncomeResponse deleteAllocation(@AuthenticationPrincipal User user, @PathVariable Long id) {
        Optional<Allocation> a = allocationRepo.findByIdAndUserId(id, user.getId());
        String m = a.map(Allocation::getMonth).orElse(null);
        a.ifPresent(alloc -> {
            // deleteAll(Iterable) é transacional por omissão — ao contrário de um
            // deleteBy... derivado, que exigiria transação própria (não há service layer)
            List<AllocationItem> items = itemRepo.findByAllocationIdOrderByIdAsc(alloc.getId());
            itemRepo.deleteAll(items);
            allocationRepo.delete(alloc);
            var values = auditFields(alloc);
            values.put("items", items.size());
            audit.deleted(user.getId(), AuditEntity.ALLOCATION, alloc.getId(), alloc.getName(), values);
        });
        return get(user, m);
    }

    // ---------- itens da categoria ----------

    @PostMapping("/allocations/{allocId}/items")
    public IncomeResponse addItem(@AuthenticationPrincipal User user, @PathVariable Long allocId,
                                  @Valid @RequestBody AllocationItemRequest req) {
        Allocation alloc = allocationRepo.findByIdAndUserId(allocId, user.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria não encontrada."));
        validateItem(req);
        AllocationItem it = new AllocationItem();
        it.setUserId(user.getId());
        it.setAllocationId(alloc.getId());
        it.setName(req.name().trim());
        it.setAmount(req.amount());
        itemRepo.save(it);
        audit.created(user.getId(), AuditEntity.ALLOCATION_ITEM, it.getId(), it.getName(), auditFields(it));
        return get(user, alloc.getMonth());
    }

    @PutMapping("/allocations/items/{id}")
    public IncomeResponse updateItem(@AuthenticationPrincipal User user, @PathVariable Long id,
                                     @Valid @RequestBody AllocationItemRequest req) {
        validateItem(req);
        AllocationItem it = itemRepo.findByIdAndUserId(id, user.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item não encontrado."));
        var before = auditFields(it);
        it.setName(req.name().trim());
        it.setAmount(req.amount());
        itemRepo.save(it);
        audit.updated(user.getId(), AuditEntity.ALLOCATION_ITEM, it.getId(), it.getName(), before, auditFields(it));
        return get(user, monthOfItem(user, it));
    }

    @DeleteMapping("/allocations/items/{id}")
    public IncomeResponse deleteItem(@AuthenticationPrincipal User user, @PathVariable Long id) {
        Optional<AllocationItem> it = itemRepo.findByIdAndUserId(id, user.getId());
        String m = it.map(i -> monthOfItem(user, i)).orElse(null);
        it.ifPresent(i -> {
            itemRepo.delete(i);
            audit.deleted(user.getId(), AuditEntity.ALLOCATION_ITEM, i.getId(), i.getName(), auditFields(i));
        });
        return get(user, m);
    }

    /** Os campos que a auditoria regista (antes/depois). Montantes em EUR. */
    private static Map<String, Object> auditFields(Allocation a) {
        return AuditService.fields("name", a.getName(), "month", a.getMonth(), "percentage", a.getPercentage(),
                "fixedAmount", a.getFixedAmount(), "color", a.getColor());
    }

    private static Map<String, Object> auditFields(AllocationItem it) {
        return AuditService.fields("name", it.getName(), "amount", it.getAmount(), "allocationId", it.getAllocationId());
    }

    private String monthOfItem(User user, AllocationItem it) {
        return allocationRepo.findByIdAndUserId(it.getAllocationId(), user.getId())
                .map(Allocation::getMonth).orElse(null);
    }

    private void validateItem(AllocationItemRequest req) {
        if (req.amount() == null || req.amount().signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O valor do item não pode ser negativo.");
        }
    }

    // ---------- internals ----------

    private void validate(AllocationRequest req) {
        boolean hasPct = req.percentage() != null && req.percentage().signum() > 0;
        boolean hasFixed = req.fixedAmount() != null && req.fixedAmount().signum() > 0;
        if (hasPct == hasFixed) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Define a percentagem ou o valor fixo (apenas um dos dois, maior que zero).");
        }
        if (hasPct && req.percentage().compareTo(HUNDRED) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A percentagem não pode ser superior a 100%.");
        }
    }

    private void apply(Allocation a, AllocationRequest req) {
        boolean hasFixed = req.fixedAmount() != null && req.fixedAmount().signum() > 0;
        a.setName(req.name());
        a.setPercentage(hasFixed ? null : req.percentage());
        a.setFixedAmount(hasFixed ? req.fixedAmount() : null);
        a.setColor(normalizeColor(req.color()));
    }

    /** Aceita uma cor hex #RRGGBB (case-insensitive); vazio → null (usa a paleta por omissão). */
    private String normalizeColor(String color) {
        if (color == null || color.isBlank()) return null;
        String c = color.trim();
        if (!c.matches("#[0-9a-fA-F]{6}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cor inválida. Usa o formato #RRGGBB.");
        }
        return c.toLowerCase();
    }

    private IncomeResponse buildResponse(User user, String month, IncomeSettings settings, String copiedFrom) {
        BigDecimal income = settings != null ? settings.getMonthlyIncome() : BigDecimal.ZERO;

        List<Allocation> allocEntities = allocationRepo.findByUserIdAndMonthOrderByIdAsc(user.getId(), month);
        List<AllocationItem> allItems = allocEntities.isEmpty()
                ? List.of()
                : itemRepo.findByUserIdAndAllocationIdInOrderByIdAsc(
                        user.getId(), allocEntities.stream().map(Allocation::getId).toList());

        List<AllocationDto> allocations = allocEntities.stream()
                .map(a -> {
                    BigDecimal pct = a.getPercentage() != null ? a.getPercentage() : BigDecimal.ZERO;
                    BigDecimal amount = a.getFixedAmount() != null
                            ? a.getFixedAmount()
                            : income.multiply(pct).divide(HUNDRED, 2, RoundingMode.HALF_UP);
                    BigDecimal effectivePct = income.signum() > 0
                            ? amount.multiply(HUNDRED).divide(income, 1, RoundingMode.HALF_UP)
                            : pct;
                    List<AllocationItemDto> items = allItems.stream()
                            .filter(it -> it.getAllocationId().equals(a.getId()))
                            .map(it -> new AllocationItemDto(it.getId(), it.getName(),
                                    it.getAmount() != null ? it.getAmount() : BigDecimal.ZERO))
                            .toList();
                    BigDecimal itemsTotal = items.stream()
                            .map(AllocationItemDto::amount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                            .setScale(2, RoundingMode.HALF_UP);
                    return new AllocationDto(a.getId(), a.getName(), a.getPercentage(), a.getFixedAmount(),
                            amount, effectivePct, items, itemsTotal, a.getColor());
                })
                .toList();

        BigDecimal totalAllocated = allocations.stream()
                .map(AllocationDto::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalPct = income.signum() > 0
                ? totalAllocated.multiply(HUNDRED).divide(income, 1, RoundingMode.HALF_UP)
                : allocations.stream()
                    .map(AllocationDto::percentage)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal unallocated = income.subtract(totalAllocated);

        List<String> availableMonths = incomeRepo.findByUserIdOrderByMonthAsc(user.getId()).stream()
                .map(IncomeSettings::getMonth)
                .filter(Objects::nonNull)
                .distinct()
                .toList();

        return new IncomeResponse(month, month.equals(currentMonth()), income, allocations,
                totalAllocated.setScale(2, RoundingMode.HALF_UP), totalPct,
                unallocated.setScale(2, RoundingMode.HALF_UP), availableMonths, copiedFrom);
    }
}
