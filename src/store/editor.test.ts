import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject } from '../core/types';
import { useEditor } from './editor';

const count = () => {
  const p = useEditor.getState().project;
  return { nodes: Object.keys(p.nodes).length, walls: Object.keys(p.walls).length };
};

beforeEach(() => {
  useEditor.setState({ project: emptyProject(), chain: [], start: null, tool: 'wall' });
  useEditor.temporal.getState().clear();
});

describe('начало цепочки', () => {
  it('брошенная первая точка не остаётся в проекте и не попадает в историю', () => {
    const s = useEditor.getState();
    s.placePoint({ x: 1, y: 1 });
    expect(count()).toEqual({ nodes: 0, walls: 0 });
    s.endChain();
    expect(count()).toEqual({ nodes: 0, walls: 0 });
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0);
  });

  it('первая стена ставит обе точки одним шагом отмены', () => {
    const s = useEditor.getState();
    s.placePoint({ x: 0, y: 0 });
    s.placePoint({ x: 3, y: 0 });
    expect(count()).toEqual({ nodes: 2, walls: 1 });
    expect(useEditor.temporal.getState().pastStates).toHaveLength(1);
  });

  it('повторный клик в начало ничего не ставит', () => {
    const s = useEditor.getState();
    s.placePoint({ x: 0, y: 0 });
    s.placePoint({ x: 0, y: 0 });
    expect(count()).toEqual({ nodes: 0, walls: 0 });
    expect(useEditor.getState().start).not.toBeNull();
  });

  it('начало на стене: стена режется только когда появилась новая стена', () => {
    const s = useEditor.getState();
    s.placePoint({ x: 0, y: 0 });
    s.placePoint({ x: 4, y: 0 });
    s.endChain();
    const wall = Object.keys(useEditor.getState().project.walls)[0]!;
    s.placePoint({ x: 2, y: 0 }, undefined, wall);
    s.endChain();
    expect(count()).toEqual({ nodes: 2, walls: 1 });
    s.placePoint({ x: 2, y: 0 }, undefined, wall);
    s.placePoint({ x: 2, y: 2 });
    expect(count()).toEqual({ nodes: 4, walls: 3 });
  });
});
