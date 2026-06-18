import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VaultSelector } from './VaultSelector';
import { useTaskStore } from '../stores/taskStore';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { open } from '@tauri-apps/plugin-dialog';
const mockOpen = vi.mocked(open);

const setVaultPath = vi.fn();
const createVault = vi.fn();
const setShowWelcome = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useTaskStore.setState({
    vaultPath: null,
    isLoading: false,
    error: null,
    setVaultPath,
    createVault,
    setShowWelcome,
  });
});

describe('VaultSelector welcome screen', () => {
  it('renders the welcome heading and both actions', () => {
    render(<VaultSelector />);
    expect(screen.getByText('Welcome to Annado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open a vault/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start fresh/ })).toBeInTheDocument();
  });

  it('hides the "Back to" link on true first run (no vault set)', () => {
    render(<VaultSelector />);
    expect(screen.queryByText(/Back to/)).not.toBeInTheDocument();
  });

  it('shows "Back to <vault>" when a vault is set and returns on click', () => {
    useTaskStore.setState({ vaultPath: '/Users/demo/MyVault' });
    render(<VaultSelector />);

    const back = screen.getByRole('button', { name: /Back to MyVault/ });
    fireEvent.click(back);
    expect(setShowWelcome).toHaveBeenCalledWith(false);
  });

  it('"Start fresh" creates a vault at the chosen folder', async () => {
    mockOpen.mockResolvedValue('/Users/demo/Fresh Vault');
    render(<VaultSelector />);

    fireEvent.click(screen.getByRole('button', { name: /Start fresh/ }));
    await waitFor(() => expect(createVault).toHaveBeenCalledWith('/Users/demo/Fresh Vault'));
    expect(setVaultPath).not.toHaveBeenCalled();
  });

  it('"Open a vault" loads the chosen existing folder', async () => {
    mockOpen.mockResolvedValue('/Users/demo/Existing');
    render(<VaultSelector />);

    fireEvent.click(screen.getByRole('button', { name: /Open a vault/ }));
    await waitFor(() => expect(setVaultPath).toHaveBeenCalledWith('/Users/demo/Existing'));
    expect(createVault).not.toHaveBeenCalled();
  });
});
