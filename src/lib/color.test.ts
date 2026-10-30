import { isUnprojectable, normalizeColor, parseColorLiteral } from './color';

describe('color parsing', () => {
  it.each([
    ['#f00', '#ff0000', 1],
    ['#FF0000', '#ff0000', 1],
    ['#00f8', '#0000ff', 0x88 / 255],
    ['#11223344', '#112233', 0x44 / 255],
    ['rgb(255, 210, 0)', '#ffd200', 1],
    ['rgb(255 210 0 / 0.5)', '#ffd200', 0.5],
    ['rgba(0,0,255,1)', '#0000ff', 1],
    ['rgb(100%, 0%, 50%)', '#ff0080', 1],
  ])('%s → %s', (input, hex, alpha) => {
    const c = parseColorLiteral(input)!;
    expect(c.hex).toBe(hex);
    expect(c.alpha).toBeCloseTo(alpha);
  });

  it.each(['#12', '#12345', 'rgb(1,2)', 'hsl(0 100% 50%)', 'url(#g)', ''])('rejects %s', (input) => {
    expect(parseColorLiteral(input)).toBeNull();
  });

  it('normalizes named colors through the DOM', () => {
    expect(normalizeColor('red')?.hex).toBe('#ff0000');
    expect(normalizeColor('notacolor')).toBeNull();
  });

  it('treats near-black as unprojectable', () => {
    expect(isUnprojectable('#000000')).toBe(true);
    expect(isUnprojectable('#050505')).toBe(true);
    expect(isUnprojectable('#200000')).toBe(false);
  });
});
