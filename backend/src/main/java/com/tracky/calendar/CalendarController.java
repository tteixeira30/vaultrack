package com.tracky.calendar;

import com.tracky.auth.User;
import com.tracky.expense.Account;
import com.tracky.expense.AccountRepository;
import com.tracky.goal.Goal;
import com.tracky.goal.GoalRepository;
import com.tracky.investment.Investment;
import com.tracky.investment.InvestmentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    private final CalendarEventRepository repo;
    private final InvestmentRepository investmentRepo;
    private final GoalRepository goalRepo;
    private final AccountRepository accountRepo;

    public CalendarController(CalendarEventRepository repo, InvestmentRepository investmentRepo,
                             GoalRepository goalRepo, AccountRepository accountRepo) {
        this.repo = repo;
        this.investmentRepo = investmentRepo;
        this.goalRepo = goalRepo;
        this.accountRepo = accountRepo;
    }

    // ---------- DTOs ----------

    public record EventDto(Long id, String name, CalendarEvent.Category category, boolean inflow,
                           BigDecimal amount, CalendarEvent.Frequency frequency, Integer dayOfMonth,
                           LocalDate eventDate, boolean active) {}
    /** Uma ocorrência concreta numa data. source: MANUAL, INVESTMENT ou GOAL. */
    public record Occurrence(LocalDate date, String name, CalendarEvent.Category category, boolean inflow,
                             BigDecimal amount, String source, Long eventId) {}
    public record MonthResponse(String month, List<EventDto> events, List<Occurrence> occurrences,
                                BigDecimal inflows, BigDecimal outflows, BigDecimal net) {}
    /** `eventId` identifica a origem: o evento manual (editavel) ou o investimento/objetivo. */
    public record ForecastPoint(LocalDate date, String name, CalendarEvent.Category category, boolean inflow,
                                BigDecimal amount, String source, Long eventId, BigDecimal balanceAfter) {}
    public record ForecastResponse(BigDecimal startingBalance, boolean hasBalance, int days,
                                   List<ForecastPoint> points, BigDecimal endBalance) {}

    public record EventRequest(@NotBlank String name, @NotNull CalendarEvent.Category category, boolean inflow,
                               @NotNull @Positive BigDecimal amount, @NotNull CalendarEvent.Frequency frequency,
                               Integer dayOfMonth, LocalDate eventDate, Boolean active) {}

    // ---------- endpoints ----------

    @GetMapping
    public MonthResponse month(@AuthenticationPrincipal User user,
                               @RequestParam(required = false) String month) {
        YearMonth ym = parseMonth(month);
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();

        List<Occurrence> occ = occurrencesBetween(user, from, to);
        BigDecimal inflows = occ.stream().filter(Occurrence::inflow)
                .map(Occurrence::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal outflows = occ.stream().filter(o -> !o.inflow())
                .map(Occurrence::amount).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<EventDto> events = repo.findByUserIdOrderByIdAsc(user.getId()).stream()
                .map(this::toDto).toList();

        return new MonthResponse(ym.toString(), events, occ, inflows, outflows, inflows.subtract(outflows));
    }

    @GetMapping("/upcoming")
    public ForecastResponse upcoming(@AuthenticationPrincipal User user,
                                     @RequestParam(defaultValue = "60") int days) {
        int horizon = Math.max(7, Math.min(days, 365));
        LocalDate from = LocalDate.now();
        LocalDate to = from.plusDays(horizon);

        List<Occurrence> occ = occurrencesBetween(user, from, to);

        // O ponto de partida da previsão é a soma dos saldos definidos nas contas
        // bancárias (funcionalidade de despesas). Só há previsão de saldo quando
        // pelo menos uma conta tem saldo definido; caso contrário mostra-se apenas
        // o fluxo acumulado.
        List<Account> accounts = accountRepo.findByUserIdOrderByIdAsc(user.getId());
        boolean hasBalance = accounts.stream().anyMatch(a -> a.getCurrentBalance() != null);
        BigDecimal startingBalance = accounts.stream()
                .map(Account::getCurrentBalance)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal balance = startingBalance;
        List<ForecastPoint> points = new ArrayList<>();
        for (Occurrence o : occ) {
            balance = o.inflow() ? balance.add(o.amount()) : balance.subtract(o.amount());
            points.add(new ForecastPoint(o.date(), o.name(), o.category(), o.inflow(),
                    o.amount(), o.source(), o.eventId(), balance));
        }
        return new ForecastResponse(hasBalance ? startingBalance : null, hasBalance,
                horizon, points, balance);
    }

    @PostMapping("/events")
    public EventDto create(@AuthenticationPrincipal User user, @Valid @RequestBody EventRequest req) {
        CalendarEvent e = new CalendarEvent();
        e.setUserId(user.getId());
        apply(e, req);
        return toDto(repo.save(e));
    }

    @PutMapping("/events/{id}")
    public EventDto update(@AuthenticationPrincipal User user, @PathVariable Long id,
                           @Valid @RequestBody EventRequest req) {
        CalendarEvent e = repo.findByIdAndUserId(id, user.getId()).orElseThrow();
        apply(e, req);
        return toDto(repo.save(e));
    }

    @DeleteMapping("/events/{id}")
    public void delete(@AuthenticationPrincipal User user, @PathVariable Long id) {
        repo.findByIdAndUserId(id, user.getId()).ifPresent(repo::delete);
    }

    // ---------- internals ----------

    private void apply(CalendarEvent e, EventRequest req) {
        if (req.frequency() == CalendarEvent.Frequency.MONTHLY) {
            if (req.dayOfMonth() == null || req.dayOfMonth() < 1 || req.dayOfMonth() > 31) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica um dia do mês entre 1 e 31.");
            }
        } else if (req.eventDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica a data do evento.");
        }
        e.setName(req.name().trim());
        e.setCategory(req.category());
        e.setInflow(req.inflow());
        e.setAmount(req.amount());
        e.setFrequency(req.frequency());
        e.setDayOfMonth(req.frequency() == CalendarEvent.Frequency.MONTHLY ? req.dayOfMonth() : null);
        e.setEventDate(req.frequency() == CalendarEvent.Frequency.MONTHLY ? null : req.eventDate());
        e.setActive(req.active() == null || req.active());
    }

    private EventDto toDto(CalendarEvent e) {
        return new EventDto(e.getId(), e.getName(), e.getCategory(), e.isInflow(), e.getAmount(),
                e.getFrequency(), e.getDayOfMonth(), e.getEventDate(), e.isActive());
    }

    /** Todas as ocorrências (eventos manuais + derivados) no intervalo [from, to], ordenadas por data. */
    private List<Occurrence> occurrencesBetween(User user, LocalDate from, LocalDate to) {
        List<Occurrence> out = new ArrayList<>();

        for (CalendarEvent e : repo.findByUserIdOrderByIdAsc(user.getId())) {
            if (!e.isActive()) continue;
            for (LocalDate d : datesFor(e, from, to)) {
                out.add(new Occurrence(d, e.getName(), e.getCategory(), e.isInflow(),
                        e.getAmount(), "MANUAL", e.getId()));
            }
        }

        // Derivados: reforços mensais de investimentos (no dia configurado) — saída de dinheiro da conta
        for (Investment inv : investmentRepo.findByUserIdOrderByIdAsc(user.getId())) {
            BigDecimal c = inv.getMonthlyContribution();
            if (c != null && c.signum() > 0) {
                for (LocalDate d : monthlyDates(inv.getContributionDay(), from, to)) {
                    out.add(new Occurrence(d, "Reforço · " + inv.getName(), CalendarEvent.Category.SAVING,
                            false, c, "INVESTMENT", inv.getId()));
                }
            }
        }

        // Derivados: depósitos automáticos de objetivos (no dia configurado)
        for (Goal g : goalRepo.findByUserIdOrderByIdAsc(user.getId())) {
            if (g.isAutoDeposit() && g.getMonthlyAllocation() != null && g.getMonthlyAllocation().signum() > 0) {
                for (LocalDate d : monthlyDates(g.getContributionDay(), from, to)) {
                    out.add(new Occurrence(d, "Depósito · " + g.getName(), CalendarEvent.Category.SAVING,
                            false, g.getMonthlyAllocation(), "GOAL", g.getId()));
                }
            }
        }

        out.sort(Comparator.comparing(Occurrence::date)
                .thenComparing(o -> o.inflow() ? 0 : 1));
        return out;
    }

    private List<LocalDate> datesFor(CalendarEvent e, LocalDate from, LocalDate to) {
        return switch (e.getFrequency()) {
            case MONTHLY -> monthlyDates(e.getDayOfMonth() == null ? 1 : e.getDayOfMonth(), from, to);
            case ONCE -> (e.getEventDate() != null && !e.getEventDate().isBefore(from)
                    && !e.getEventDate().isAfter(to)) ? List.of(e.getEventDate()) : List.of();
            case YEARLY -> yearlyDates(e.getEventDate(), from, to);
        };
    }

    /** Datas mensais no dia indicado (ajustado ao comprimento do mês) dentro de [from, to]. */
    private List<LocalDate> monthlyDates(int dayOfMonth, LocalDate from, LocalDate to) {
        List<LocalDate> dates = new ArrayList<>();
        YearMonth ym = YearMonth.from(from);
        YearMonth end = YearMonth.from(to);
        while (!ym.isAfter(end)) {
            int day = Math.min(dayOfMonth, ym.lengthOfMonth());
            LocalDate d = ym.atDay(day);
            if (!d.isBefore(from) && !d.isAfter(to)) dates.add(d);
            ym = ym.plusMonths(1);
        }
        return dates;
    }

    private List<LocalDate> yearlyDates(LocalDate anchor, LocalDate from, LocalDate to) {
        if (anchor == null) return List.of();
        List<LocalDate> dates = new ArrayList<>();
        for (int year = from.getYear(); year <= to.getYear(); year++) {
            int day = Math.min(anchor.getDayOfMonth(), YearMonth.of(year, anchor.getMonth()).lengthOfMonth());
            LocalDate d = LocalDate.of(year, anchor.getMonth(), day);
            if (!d.isBefore(from) && !d.isAfter(to)) dates.add(d);
        }
        return dates;
    }

    private YearMonth parseMonth(String month) {
        if (month == null || month.isBlank()) return YearMonth.now();
        try {
            return YearMonth.parse(month.trim());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mês inválido — usa o formato AAAA-MM.");
        }
    }
}
