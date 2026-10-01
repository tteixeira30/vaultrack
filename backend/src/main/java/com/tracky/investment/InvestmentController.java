package com.tracky.investment;

import com.tracky.auth.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.YearMonth;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

@RestController
@RequestMapping("/api/investments")
public class InvestmentController {

    private final InvestmentRepository repo;
    private final PriceService priceService;

    public InvestmentController(InvestmentRepository repo, PriceService priceService) {
        this.repo = repo;
        this.priceService = priceService;
    }

    public record CreateRequest(@NotBlank @Size(max = 100, message = "O nome não pode ter mais de 100 caracteres.") String name,
                                @Size(max = 60, message = "O símbolo não pode ter mais de 60 caracteres.") String symbol, @NotNull Investment.Type type,
                                @NotNull BigDecimal currentValue, @NotNull BigDecimal gainPercent,
                                BigDecimal monthlyContribution, Integer contributionDay) {}
    public record UpdateRequest(@NotBlank @Size(max = 100, message = "O nome não pode ter mais de 100 caracteres.") String name,
                                @Size(max = 60, message = "O símbolo não pode ter mais de 60 caracteres.") String symbol, Investment.Type type,
                                BigDecimal currentValue, BigDecimal gainPercent,
                                BigDecimal monthlyContribution, Integer contributionDay) {}
    public record InvestmentDto(Long id, String name, String symbol, Investment.Type type,
                                BigDecimal initialValue, BigDecimal quantity, BigDecimal currentPrice,
                                BigDecimal currentValue, BigDecimal gain, BigDecimal gainPercent, boolean live,
                                BigDecimal monthlyContribution, int contributionDay) {}
    public record PortfolioPoint(LocalDate date, BigDecimal value) {}
    public record Summary(BigDecimal totalInvested, BigDecimal totalCurrent,
                          BigDecimal totalGain, BigDecimal totalGainPercent) {}
    public record PortfolioResponse(Summary summary, List<InvestmentDto> investments) {}

    @GetMapping
    public PortfolioResponse list(@AuthenticationPrincipal User user) {
        List<InvestmentDto> dtos = repo.findByUserIdOrderByIdAsc(user.getId()).stream().map(this::enrich).toList();
        BigDecimal invested = dtos.stream().map(InvestmentDto::initialValue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal current = dtos.stream().map(InvestmentDto::currentValue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal gain = current.subtract(invested);
        BigDecimal gainPct = invested.signum() == 0 ? BigDecimal.ZERO
                : gain.multiply(BigDecimal.valueOf(100)).divide(invested, 2, RoundingMode.HALF_UP);
        return new PortfolioResponse(new Summary(scale(invested), scale(current), scale(gain), gainPct), dtos);
    }

    /**
     * Força cotações em tempo real: limpa a cache de preços dos ativos do utilizador
     * e devolve o portefólio já com os valores acabados de obter.
     */
    @PostMapping("/refresh")
    public PortfolioResponse refresh(@AuthenticationPrincipal User user) {
        repo.findByUserIdOrderByIdAsc(user.getId())
                .forEach(inv -> priceService.evictPrice(inv.getSymbol(), inv.getType()));
        return list(user);
    }

    @PostMapping
    public InvestmentDto create(@AuthenticationPrincipal User user, @Valid @RequestBody CreateRequest req) {
        Investment inv = new Investment();
        inv.setUserId(user.getId());
        inv.setName(req.name());
        inv.setType(req.type());
        inv.setSymbol(normalizeSymbol(req.symbol(), req.type()));
        applyValue(inv, req.currentValue(), req.gainPercent());
        applyMonthlyContribution(inv, req.monthlyContribution(), req.contributionDay());
        return enrich(repo.save(inv));
    }

    @PutMapping("/{id}")
    public InvestmentDto update(@AuthenticationPrincipal User user, @PathVariable Long id,
                                @Valid @RequestBody UpdateRequest req) {
        Investment inv = repo.findByIdAndUserId(id, user.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Investimento não encontrado."));
        inv.setName(req.name());
        if (req.type() != null) inv.setType(req.type());
        inv.setSymbol(normalizeSymbol(req.symbol(), inv.getType()));
        if (req.currentValue() != null) {
            applyValue(inv, req.currentValue(), req.gainPercent() != null ? req.gainPercent() : BigDecimal.ZERO);
        }
        applyMonthlyContribution(inv, req.monthlyContribution(), req.contributionDay());
        return enrich(repo.save(inv));
    }

    private String normalizeSymbol(String symbol, Investment.Type type) {
        if (type != null && type.isManualOnly() || symbol == null || symbol.isBlank()) return null;
        return symbol.trim().toUpperCase();
    }

    /**
     * Fixa o valor atual e a % de ganho: recalcula o valor inicial e, em ativos com
     * cotação, as unidades detidas ao preço do momento (para continuar a seguir em tempo real).
     * Sem símbolo/cotação (ou tipo "Outro") o investimento fica manual.
     */
    private void applyValue(Investment inv, BigDecimal currentValue, BigDecimal gainPercent) {
        inv.setFallbackValue(currentValue);
        BigDecimal factor = BigDecimal.ONE.add(gainPercent.divide(BigDecimal.valueOf(100), MathContext.DECIMAL64));
        if (factor.signum() <= 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O ganho tem de ser superior a -100%.");
        inv.setInitialValue(currentValue.divide(factor, 4, RoundingMode.HALF_UP));
        inv.setQuantity(null);
        if (inv.getSymbol() != null && inv.getType() != null && !inv.getType().isManualOnly()) {
            priceService.getPriceEur(inv.getSymbol(), inv.getType()).ifPresent(price -> {
                if (price.signum() > 0) {
                    inv.setQuantity(currentValue.divide(price, 8, RoundingMode.HALF_UP));
                }
            });
        }
    }

    /**
     * Define ou remove o reforço mensal; ao ativar de novo marca o mês atual como já feito.
     * Mudar o dia do reforço só afeta o presente/futuro — o lastAppliedMonth não é tocado,
     * portanto meses já aplicados nunca se repetem nem se desfazem.
     */
    private void applyMonthlyContribution(Investment inv, BigDecimal monthlyContribution, Integer contributionDay) {
        if (contributionDay != null && (contributionDay < 1 || contributionDay > 31)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica um dia do mês entre 1 e 31.");
        }
        boolean active = monthlyContribution != null && monthlyContribution.signum() > 0;
        if (active && inv.getMonthlyContribution() == null) {
            inv.setLastAppliedMonth(YearMonth.now().toString());
        }
        inv.setMonthlyContribution(active ? monthlyContribution : null);
        inv.setContributionDay(contributionDay);
    }

    @DeleteMapping("/{id}")
    public void delete(@AuthenticationPrincipal User user, @PathVariable Long id) {
        repo.findByIdAndUserId(id, user.getId()).ifPresent(repo::delete);
    }

    /**
     * Evolução do valor total do portefólio em EUR.
     * range: 1mo, 3mo, 6mo, 1y
     */
    @GetMapping("/portfolio/history")
    public List<PortfolioPoint> history(@AuthenticationPrincipal User user,
                                        @RequestParam(defaultValue = "3mo") String range) {
        List<Investment> investments = repo.findByUserIdOrderByIdAsc(user.getId());
        List<Map<LocalDate, BigDecimal>> series = new ArrayList<>();

        for (Investment inv : investments) {
            if (inv.getQuantity() != null && inv.getSymbol() != null) {
                Map<LocalDate, BigDecimal> valueByDate = new TreeMap<>();
                for (PriceService.PricePoint p : priceService.getHistoryEur(inv.getSymbol(), inv.getType(), range)) {
                    valueByDate.put(p.date(), p.price().multiply(inv.getQuantity()));
                }
                if (!valueByDate.isEmpty()) series.add(valueByDate);
            } else if (inv.getFallbackValue() != null) {
                // investimentos sem preço live entram como valor constante
                series.add(Map.of(LocalDate.MIN, inv.getFallbackValue()));
            }
        }

        // união de todas as datas com cotação
        TreeMap<LocalDate, BigDecimal> total = new TreeMap<>();
        series.stream()
                .flatMap(s -> s.keySet().stream())
                .filter(d -> !d.equals(LocalDate.MIN))
                .forEach(d -> total.put(d, BigDecimal.ZERO));
        if (total.isEmpty()) return List.of();

        // cada série contribui com o último valor conhecido em cada data (forward-fill)
        for (Map<LocalDate, BigDecimal> s : series) {
            TreeMap<LocalDate, BigDecimal> sorted = new TreeMap<>(s);
            for (Map.Entry<LocalDate, BigDecimal> day : total.entrySet()) {
                Map.Entry<LocalDate, BigDecimal> known = sorted.floorEntry(day.getKey());
                if (known == null) known = sorted.firstEntry();
                day.setValue(day.getValue().add(known.getValue()));
            }
        }

        return total.entrySet().stream()
                .map(e -> new PortfolioPoint(e.getKey(), scale(e.getValue())))
                .toList();
    }

    public record ProjectionPoint(int month, BigDecimal value) {}
    public record ProjectionScenario(String id, String label, double annualRatePercent,
                                     List<ProjectionPoint> points, BigDecimal finalValue) {}
    public record ProjectionResponse(BigDecimal startValue, int months, BigDecimal monthlyContribution,
                                     BigDecimal totalContributed, List<ProjectionScenario> scenarios) {}

    /**
     * Projeção deliberadamente conservadora do portefólio.
     * Cenários abaixo da média histórica dos mercados; inclui a linha de referência
     * "total investido" (0%) para comparação com o que foi efetivamente contribuído.
     * type filtra o ponto de partida por tipo de ativo; customRate acrescenta um cenário próprio.
     */
    @GetMapping("/projection")
    public ProjectionResponse projection(@AuthenticationPrincipal User user,
                                         @RequestParam(defaultValue = "60") int months,
                                         @RequestParam(defaultValue = "0") BigDecimal monthly,
                                         @RequestParam(required = false) String type,
                                         @RequestParam(required = false) BigDecimal customRate) {
        int horizon = Math.max(1, Math.min(months, 600));
        BigDecimal contribution = (monthly == null || monthly.signum() < 0) ? BigDecimal.ZERO : monthly;

        Investment.Type typeFilter = null;
        if (type != null && !type.isBlank() && !type.equalsIgnoreCase("all")) {
            try {
                typeFilter = Investment.Type.valueOf(type.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tipo de investimento inválido: " + type);
            }
        }
        final Investment.Type filter = typeFilter;

        BigDecimal start = repo.findByUserIdOrderByIdAsc(user.getId()).stream()
                .filter(inv -> filter == null || inv.getType() == filter)
                .map(inv -> enrich(inv).currentValue())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        record ScenarioDef(String id, String label, double annualRate) {}
        List<ScenarioDef> defs = new ArrayList<>(List.of(
                new ScenarioDef("pessimista", "Pessimista", -2.0),
                new ScenarioDef("investido", "Total investido (0%)", 0.0),
                new ScenarioDef("conservador", "Conservador", 2.0),
                new ScenarioDef("moderado", "Moderado", 5.0)));
        if (customRate != null) {
            // limitar a valores matematicamente seguros e realistas
            double rate = Math.max(-95, Math.min(customRate.doubleValue(), 100));
            defs.add(new ScenarioDef("custom", "Personalizado", rate));
        }

        List<ProjectionScenario> scenarios = defs.stream().map(def -> {
            double monthlyRate = Math.pow(1 + def.annualRate() / 100.0, 1.0 / 12.0) - 1;
            List<ProjectionPoint> points = new ArrayList<>(horizon + 1);
            double value = start.doubleValue();
            points.add(new ProjectionPoint(0, scale(BigDecimal.valueOf(value))));
            for (int m = 1; m <= horizon; m++) {
                value = value * (1 + monthlyRate) + contribution.doubleValue();
                points.add(new ProjectionPoint(m, scale(BigDecimal.valueOf(value))));
            }
            return new ProjectionScenario(def.id(), def.label(), def.annualRate(),
                    points, points.getLast().value());
        }).toList();

        BigDecimal totalContributed = start.add(contribution.multiply(BigDecimal.valueOf(horizon)));
        return new ProjectionResponse(scale(start), horizon, contribution, scale(totalContributed), scenarios);
    }

    private InvestmentDto enrich(Investment inv) {
        Optional<BigDecimal> price = priceService.getPriceEur(inv.getSymbol(), inv.getType());
        boolean live = price.isPresent() && inv.getQuantity() != null;
        // linhas legadas podem ter fallbackValue/initialValue a null → trata como 0
        BigDecimal fallback = inv.getFallbackValue() != null ? inv.getFallbackValue() : BigDecimal.ZERO;
        BigDecimal initial = inv.getInitialValue() != null ? inv.getInitialValue() : BigDecimal.ZERO;
        BigDecimal currentValue = live
                ? price.get().multiply(inv.getQuantity())
                : fallback;
        BigDecimal gain = currentValue.subtract(initial);
        BigDecimal gainPct = initial.signum() == 0 ? BigDecimal.ZERO
                : gain.multiply(BigDecimal.valueOf(100)).divide(initial, 2, RoundingMode.HALF_UP);
        return new InvestmentDto(inv.getId(), inv.getName(), inv.getSymbol(), inv.getType(),
                scale(inv.getInitialValue()), inv.getQuantity(), price.map(this::scale).orElse(null),
                scale(currentValue), scale(gain), gainPct, live, inv.getMonthlyContribution(),
                inv.getContributionDay());
    }

    private BigDecimal scale(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP);
    }
}
