import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { RecorderBadgeComponent } from './recorder-badge.component';
import { RECORDER_CONFIG, SessionRecorderConfig, resolveRecorderConfig } from './recorder.tokens';
import { SessionRecorder } from './session-recorder.service';

async function setup(overrides: Partial<SessionRecorderConfig> = {}, start = true) {
  const view = await render(RecorderBadgeComponent, {
    providers: [
      provideRouter([]),
      {
        provide: RECORDER_CONFIG,
        useValue: resolveRecorderConfig({ mode: 'test', appVersion: 't', environment: 't', canRecord: () => true, ...overrides }),
      },
    ],
  });
  const rec = TestBed.inject(SessionRecorder);
  if (start) await rec.requestStart();
  await view.fixture.whenStable();
  return { rec, view, user: userEvent.setup() };
}

describe('RecorderBadgeComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('renders nothing while not recording', async () => {
    await setup({}, false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the step count while recording', async () => {
    await setup();
    expect(screen.getByRole('status').textContent).toContain('Recording, 0 steps');
  });

  it('says field values are hidden in support mode only', async () => {
    await setup({ mode: 'support' });
    expect(screen.getByText('Field values hidden')).toBeTruthy();
  });

  it('does not claim values are hidden in test mode', async () => {
    await setup();
    expect(screen.queryByText('Field values hidden')).toBeNull();
  });

  it('shows the untagged count', async () => {
    const { view, user } = await setup();
    const untagged = document.createElement('button');
    untagged.textContent = 'Untagged';
    document.body.appendChild(untagged);
    await user.click(untagged);
    await view.fixture.whenStable();
    expect(screen.getByText('1 untagged')).toBeTruthy();
    untagged.remove();
  });

  it('toggles assertion picking from Add check', async () => {
    const { rec, user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Add check' }));
    expect(rec.picking()).toBe(true);
  });

  it('stops and saves from Stop and save', async () => {
    const { rec, user } = await setup();
    const save = vi.spyOn(rec, 'stopAndSave');
    await user.click(screen.getByRole('button', { name: 'Stop and save' }));
    expect(save).toHaveBeenCalledOnce();
  });

  it('discards only after confirmation', async () => {
    const { rec, user } = await setup();
    const discard = vi.spyOn(rec, 'discard');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(discard).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(discard).toHaveBeenCalledOnce();
  });
});
