import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoveButtons } from './MoveButtons';

const accept = { to: 'accepted', by: 'manager', label: 'Принять', short: 'Принять' } as const;

describe('MoveButtons', () => {
  it('второй щелчок двойного нажатия не действует: на месте кнопки уже соседняя задача', () => {
    const onMove = vi.fn();
    render(<MoveButtons moves={[accept]} onMove={onMove} />);
    const button = screen.getByRole('button', { name: 'Принять' });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('с клавиатуры срабатывает: у такого щелчка detail равен 0', () => {
    const onMove = vi.fn();
    render(<MoveButtons moves={[accept]} onMove={onMove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Принять' }), { detail: 0 });
    expect(onMove).toHaveBeenCalledWith(accept);
  });

  it('наведение и фокус подсвечивают колонку-цель, уход снимает', () => {
    const onTarget = vi.fn();
    render(<MoveButtons moves={[accept]} onMove={vi.fn()} onTarget={onTarget} />);
    const button = screen.getByRole('button', { name: 'Принять' });
    fireEvent.mouseEnter(button);
    expect(onTarget).toHaveBeenLastCalledWith('accepted');
    fireEvent.mouseLeave(button);
    expect(onTarget).toHaveBeenLastCalledWith(null);
  });
});
