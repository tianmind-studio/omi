// @vitest-environment jsdom
// Regression suite for the onboarding automation permission step.
//
// Windows UIA has no OS permission prompt (unlike macOS Accessibility), so this step
// is a local opt-in: it records consent in the preference store, and what checkGranted
// reads is that preference, not an OS state.
//
// PRIVACY CONTRACT: the consent flag (`automationConsentedAt`) gates Omi's automation
// bridge — useChat's action-planner pre-step checks it before ever sending a UI-action
// plan to the helper. This test locks down that the step writes the flag on explicit
// user action and never on detection alone, matching the mic/screen permission steps'
// "detection is not consent" invariant.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { AutomationPermissionStep } from './AutomationPermissionStep'

const getPreferences = vi.fn()
const setPreferences = vi.fn()

vi.mock('../../lib/preferences', () => ({
  getPreferences: () => getPreferences(),
  setPreferences: (patch: unknown) => setPreferences(patch)
}))

beforeEach(() => {
  vi.useFakeTimers()
  getPreferences.mockReset().mockReturnValue({})
  setPreferences.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const tick = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('AutomationPermissionStep', () => {
  it('enables automation on click and advances after 350ms', async () => {
    const onContinue = vi.fn()
    render(<AutomationPermissionStep stepIndex={9} totalSteps={14} onContinue={onContinue} />)
    await tick()

    fireEvent.click(screen.getByText('Enable'))
    await tick()

    expect(setPreferences).toHaveBeenCalledWith({ automationConsentedAt: expect.any(Number) })
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0)

    await tick(350)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('does NOT self-consent when the step is never interacted with', async () => {
    const onContinue = vi.fn()
    render(<AutomationPermissionStep stepIndex={9} totalSteps={14} onContinue={onContinue} />)
    await tick(5000)

    expect(screen.getByText('Not enabled yet')).toBeTruthy()
    expect(onContinue).not.toHaveBeenCalled()
    expect(setPreferences).not.toHaveBeenCalled()
  })

  describe('when automation is already consented (resumed onboarding)', () => {
    beforeEach(() => {
      getPreferences.mockReturnValue({ automationConsentedAt: Date.now() - 60_000 })
    })

    it('shows Enabled and waits for Continue instead of flashing past', async () => {
      const onContinue = vi.fn()
      render(<AutomationPermissionStep stepIndex={9} totalSteps={14} onContinue={onContinue} />)
      await tick(2000)

      expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0)
      expect(screen.queryByText('Not enabled yet')).toBeNull()
      expect(screen.getByText('Continue')).toBeTruthy()
      expect(onContinue).not.toHaveBeenCalled()
    })

    it('advances on Continue without re-writing the consent', async () => {
      const onContinue = vi.fn()
      render(<AutomationPermissionStep stepIndex={9} totalSteps={14} onContinue={onContinue} />)
      await tick(2000)

      fireEvent.click(screen.getByText('Continue'))
      expect(onContinue).toHaveBeenCalledTimes(1)
      expect(setPreferences).not.toHaveBeenCalled()
    })

    it('keeps Skip available so the user can decline an already-enabled state', async () => {
      const onSkip = vi.fn()
      render(
        <AutomationPermissionStep
          stepIndex={9}
          totalSteps={14}
          onContinue={vi.fn()}
          onSkip={onSkip}
        />
      )
      await tick(2000)

      expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0)
      expect(screen.getByText('Skip')).toBeTruthy()
    })
  })

  it('forwards onBack — a Back button that steps the user back', async () => {
    const onBack = vi.fn()
    render(
      <AutomationPermissionStep
        stepIndex={9}
        totalSteps={14}
        onContinue={vi.fn()}
        onBack={onBack}
      />
    )
    await tick()

    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('skips without writing consent when Skip is clicked', async () => {
    const onSkip = vi.fn()
    render(
      <AutomationPermissionStep
        stepIndex={9}
        totalSteps={14}
        onContinue={vi.fn()}
        onSkip={onSkip}
      />
    )
    await tick()

    fireEvent.click(screen.getByText('Skip'))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(setPreferences).not.toHaveBeenCalled()
  })

  it('stops polling once unmounted (no leaked interval)', async () => {
    render(<AutomationPermissionStep stepIndex={9} totalSteps={14} onContinue={vi.fn()} />)
    await tick(1000)
    const callsWhileMounted = getPreferences.mock.calls.length
    expect(callsWhileMounted).toBeGreaterThan(0)

    cleanup()
    await tick(5000)
    expect(getPreferences.mock.calls.length).toBe(callsWhileMounted)
  })
})
