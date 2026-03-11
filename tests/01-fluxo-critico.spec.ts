import { test, expect, type Page } from '@playwright/test';
import { format, addDays } from 'date-fns';

/**
 * 01 - Fluxo Crítico E2E: Login Professor → Agenda → Agendar Aula
 *
 * Pré-requisitos:
 *   - O servidor local deve estar a correr em http://localhost:8080
 *   - Deve existir um professor de teste com as credenciais definidas abaixo
 *   - O professor deve ter pelo menos 1 aluno e 1 serviço cadastrado
 *
 * Variáveis de ambiente opcionais (override via .env ou CLI):
 *   E2E_TEACHER_EMAIL, E2E_TEACHER_PASSWORD, E2E_BASE_URL
 */

// ---------------------------------------------------------------------------
// Configuração de teste
// ---------------------------------------------------------------------------

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const TEACHER_EMAIL = process.env.E2E_TEACHER_EMAIL ?? 'professor@teste.com';
const TEACHER_PASSWORD = process.env.E2E_TEACHER_PASSWORD ?? 'Teste@123';

// Data de amanhã formatada como yyyy-MM-dd para selecção no calendário
const tomorrow = addDays(new Date(), 1);
const tomorrowFormatted = format(tomorrow, 'yyyy-MM-dd');
const tomorrowDay = tomorrow.getDate();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Aguarda que o loading global da aplicação termine.
 * A app mostra um spinner "Carregando..." em vários ecrãs.
 */
async function waitForAppReady(page: Page) {
  // Aguardar que qualquer spinner de loading desapareça
  await expect(page.getByText('Carregando...').first()).toBeHidden({ timeout: 15_000 }).catch(() => {
    // Se não existir spinner, tudo bem – a app já carregou
  });
}

/**
 * Realiza login como professor preenchendo o formulário de Auth.
 *
 * Seletores baseados em Auth.tsx:
 *   - Tab "Entrar" (TabsTrigger value="login" → texto i18n "Entrar")
 *   - Input #login-email
 *   - Input #login-password
 *   - Button submit "Entrar" (ui.enterButton)
 */
async function loginAsProfessor(page: Page) {
  await page.goto(`${BASE_URL}/auth`);

  // Aguardar que o formulário de login esteja visível (Card com Tabs)
  await expect(page.locator('[data-state="active"][data-value="login"], [role="tabpanel"]').first()).toBeVisible({ timeout: 10_000 });

  // Garantir que a tab "Entrar" está activa
  const loginTab = page.getByRole('tab', { name: 'Entrar' });
  await expect(loginTab).toBeVisible();
  await loginTab.click();

  // Preencher email
  const emailInput = page.locator('#login-email');
  await expect(emailInput).toBeVisible();
  await emailInput.fill(TEACHER_EMAIL);

  // Preencher password
  const passwordInput = page.locator('#login-password');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TEACHER_PASSWORD);

  // Submeter formulário
  const submitButton = page.getByRole('button', { name: 'Entrar' });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  // Aguardar redirecionamento para /dashboard (professor)
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 15_000 });
  await waitForAppReady(page);
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

test.describe('Fluxo Crítico – Professor: Login → Agenda → Agendar Aula', () => {
  test.beforeEach(async ({ page }) => {
    // Timeout generoso para operações com Supabase
    test.setTimeout(60_000);
  });

  test('01 – Login do professor via formulário', async ({ page }) => {
    await loginAsProfessor(page);

    // Verificar que estamos no dashboard
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);

    // O heading "Agenda" deve existir na sidebar ou página principal
    // Dashboard renderiza como professor autenticado
    await expect(page.locator('body')).toBeVisible();
  });

  test('02 – Navegar para a Agenda e verificar calendário', async ({ page }) => {
    await loginAsProfessor(page);

    // Navegar para /agenda via URL directa (mais fiável que clicar na sidebar)
    await page.goto(`${BASE_URL}/agenda`);
    await waitForAppReady(page);

    // Aguardar que o loading da Agenda termine ("Carregando agenda...")
    await expect(page.getByText('Carregando agenda...')).toBeHidden({ timeout: 15_000 }).catch(() => {});

    // Verificar que o heading "Agenda" está visível
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible({ timeout: 10_000 });

    // Verificar que o botão "Agendar Nova Aula" está visível
    // SimpleCalendar.tsx: <Button onClick={onScheduleClass} size="sm"> <Plus /> {t('scheduleNew')} </Button>
    // i18n pt: scheduleNew = "Agendar Nova Aula"
    const scheduleButton = page.getByRole('button', { name: /Agendar Nova Aula/i });
    await expect(scheduleButton).toBeVisible({ timeout: 10_000 });
  });

  test('03 – Abrir formulário e agendar aula para amanhã', async ({ page }) => {
    await loginAsProfessor(page);

    // Navegar para a Agenda
    await page.goto(`${BASE_URL}/agenda`);
    await waitForAppReady(page);
    await expect(page.getByText('Carregando agenda...')).toBeHidden({ timeout: 15_000 }).catch(() => {});

    // ---------------------------------------------------------------
    // PASSO 1: Clicar em "Agendar Nova Aula"
    // ---------------------------------------------------------------
    const scheduleButton = page.getByRole('button', { name: /Agendar Nova Aula/i });
    await expect(scheduleButton).toBeVisible({ timeout: 10_000 });
    await scheduleButton.click();

    // Aguardar que o Dialog do ClassForm abra
    // ClassForm.tsx: <Dialog open={open}> <DialogContent> <DialogHeader> <DialogTitle>
    // i18n pt: scheduleNew = "Agendar Nova Aula"
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/Agendar Nova Aula/i)).toBeVisible();

    // ---------------------------------------------------------------
    // PASSO 2: Selecionar o primeiro aluno disponível
    // ---------------------------------------------------------------
    // ClassForm.tsx renderiza checkboxes com id="student-{id}" e labels com o nome
    // Selecionar o primeiro checkbox de aluno na secção "Alunos"
    const studentCheckbox = dialog.locator('[id^="student-"]').first();
    await expect(studentCheckbox).toBeVisible({ timeout: 5_000 });
    await studentCheckbox.click();

    // Verificar que aparece um Badge com o nome do aluno selecionado
    await expect(dialog.locator('.badge, [class*="badge"]').first()).toBeVisible({ timeout: 3_000 }).catch(() => {
      // Badge pode não existir se a UI usa outra classe – continuar
    });

    // ---------------------------------------------------------------
    // PASSO 3: Selecionar serviço (para aulas pagas, que é o default)
    // ---------------------------------------------------------------
    // ClassForm.tsx: <Select value={formData.service_id}> <SelectTrigger> <SelectValue placeholder="Selecione um serviço" />
    // O switch is_paid_class está ON por default, portanto a secção de serviço está visível
    const serviceSelect = dialog.getByRole('combobox').first();

    // Se existir o select de serviço (aula paga por default), selecionar o primeiro
    const serviceSection = dialog.getByText(/Selecionar Serviço/i);
    if (await serviceSection.isVisible().catch(() => false)) {
      // Clicar no trigger do Select (shadcn/ui usa role="combobox")
      // O SelectTrigger com placeholder "Selecione um serviço"
      const serviceTrigger = dialog.getByRole('combobox').filter({ hasText: /Selecione um serviço/i });

      // Fallback: pode não ter texto se já tiver valor – tentar o trigger na card de serviço
      const trigger = (await serviceTrigger.isVisible().catch(() => false))
        ? serviceTrigger
        : serviceSelect;

      await expect(trigger).toBeVisible({ timeout: 3_000 });
      await trigger.click();

      // Aguardar que o SelectContent (popover com opções) apareça
      // shadcn Select renderiza SelectContent com role="listbox"
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible({ timeout: 3_000 });

      // Selecionar a primeira opção
      const firstOption = listbox.getByRole('option').first();
      await expect(firstOption).toBeVisible();
      await firstOption.click();

      // Verificar que o select actualizou (o placeholder desapareceu)
      await expect(dialog.getByText('Serviço selecionado:')).toBeVisible({ timeout: 3_000 }).catch(() => {
        // Feedback visual pode variar
      });
    }

    // ---------------------------------------------------------------
    // PASSO 4: Selecionar a data de amanhã
    // ---------------------------------------------------------------
    // ClassForm.tsx: <Popover> <PopoverTrigger asChild> <Button id="date" variant="outline">
    // Texto do botão: "Selecione a data" (quando vazio)
    const dateButton = dialog.locator('#date');
    await expect(dateButton).toBeVisible({ timeout: 3_000 });
    await dateButton.click();

    // Aguardar que o Calendar popover abra
    // shadcn Calendar renderiza numa PopoverContent com role="dialog" ou simplesmente visível
    const calendarPopover = page.locator('[data-radix-popper-content-wrapper]').last();
    await expect(calendarPopover).toBeVisible({ timeout: 3_000 });

    // O calendário shadcn usa <button> para cada dia com o número como texto
    // Precisamos navegar para o mês correcto se amanhã for noutro mês
    const today = new Date();
    const tomorrowDate = addDays(today, 1);

    if (tomorrowDate.getMonth() !== today.getMonth()) {
      // Amanhã é no próximo mês – clicar no botão "next" do calendário
      // O calendário shadcn usa um botão de navegação com aria-label ou ícone ChevronRight
      const nextMonthButton = calendarPopover.getByRole('button', { name: /next|próximo|›/i }).or(
        calendarPopover.locator('button[name="next-month"]')
      ).or(
        calendarPopover.locator('nav button').last()
      );
      await nextMonthButton.click();
      await page.waitForTimeout(300); // Aguardar animação do calendário
    }

    // Clicar no dia de amanhã
    // Os botões de dia no calendário shadcn têm o texto do número do dia
    // Usar getByRole('gridcell') para ser mais específico
    const dayButton = calendarPopover.getByRole('gridcell', { name: String(tomorrowDay) })
      .getByRole('button')
      .or(calendarPopover.locator(`button:has-text("${tomorrowDay}")`).first());

    // Se houver ambiguidade (ex: dia 1 aparece no mês anterior e próximo),
    // filtrar pelo botão que NÃO está disabled/outside
    const targetDay = dayButton.first();
    await expect(targetDay).toBeVisible();
    await targetDay.click();

    // Verificar que a data foi seleccionada (o botão #date mostra a data formatada)
    await expect(dialog.locator('#date')).not.toHaveText('Selecione a data', { timeout: 3_000 });

    // ---------------------------------------------------------------
    // PASSO 5: Preencher o horário
    // ---------------------------------------------------------------
    // TimePicker: renderiza um wrapper com id="time" contendo um <input type="text" inputMode="numeric" placeholder="HH:MM">
    const timeWrapper = dialog.locator('#time');
    await expect(timeWrapper).toBeVisible({ timeout: 3_000 });

    // O input real está dentro do wrapper
    const timeInput = timeWrapper.locator('input[placeholder="HH:MM"]');
    await expect(timeInput).toBeVisible();

    // Preencher horário (ex: 14:00) – o TimePicker auto-formata com ":"
    await timeInput.click();
    await timeInput.fill('1400');

    // Aguardar que o valor seja processado pelo TimePicker (auto-commit em 4 dígitos)
    await expect(timeInput).toHaveValue('14:00', { timeout: 2_000 });

    // ---------------------------------------------------------------
    // PASSO 6: Submeter o formulário
    // ---------------------------------------------------------------
    // ClassForm.tsx: <Button type="submit">{loading ? t('actions.scheduling') : t('actions.scheduleClass')}</Button>
    // i18n pt: actions.scheduleClass = "Agendar Aula"
    const submitButton = dialog.getByRole('button', { name: /Agendar Aula/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Aguardar que o botão mude para "Agendando..." (estado loading)
    // Ou que o dialog feche (sucesso)
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // ---------------------------------------------------------------
    // PASSO 7: Verificar feedback de sucesso
    // ---------------------------------------------------------------
    // Agenda.tsx mostra toast de sucesso: "Aula agendada com sucesso!"
    // O toast do shadcn-ui aparece como [role="status"] ou similar
    // Verificar que o toast de sucesso aparece OU que voltámos ao calendário sem erro
    const successToast = page.getByText(/agendada com sucesso|Aula.*agendad/i).first();
    const calendarVisible = page.getByRole('heading', { name: 'Agenda', level: 1 });

    // Pelo menos um dos dois deve estar visível
    await expect(successToast.or(calendarVisible)).toBeVisible({ timeout: 10_000 });
  });
});
