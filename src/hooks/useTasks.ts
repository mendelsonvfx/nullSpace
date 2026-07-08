import { useProjectStore } from '../store/projectStore';
import type { TodoItem, TaskContext } from '../types/project';

export function useTasks(projectId: string, context: TaskContext) {
  const add = (text: string) => {
    const s = useProjectStore.getState();
    if (context.isShot && context.shotId)
      s.addShotTodo(projectId, context.shotId, text);
    else if (context.isSpecialContext && context.specialContextId)
      s.addSpecialContextTodo(projectId, context.specialContextId, text);
    else if (context.isScene && context.sceneId)
      s.addSceneTodo(projectId, context.sceneId, text);
    else
      s.addTodo(projectId, text);
  };

  const toggle = (todoId: string) => {
    const s = useProjectStore.getState();
    if (context.isShot && context.shotId)
      s.toggleShotTodo(projectId, context.shotId, todoId);
    else if (context.isSpecialContext && context.specialContextId)
      s.toggleSpecialContextTodo(projectId, context.specialContextId, todoId);
    else if (context.isScene && context.sceneId)
      s.toggleSceneTodo(projectId, context.sceneId, todoId);
    else
      s.toggleTodo(projectId, todoId);
  };

  const remove = (todoId: string) => {
    const s = useProjectStore.getState();
    if (context.isShot && context.shotId)
      s.removeShotTodo(projectId, context.shotId, todoId);
    else if (context.isSpecialContext && context.specialContextId)
      s.removeSpecialContextTodo(projectId, context.specialContextId, todoId);
    else if (context.isScene && context.sceneId)
      s.removeSceneTodo(projectId, context.sceneId, todoId);
    else
      s.removeTodo(projectId, todoId);
  };

  const update = (todoId: string, patch: Partial<TodoItem>) => {
    const s = useProjectStore.getState();
    if (context.isShot && context.shotId)
      s.updateShotTodo(projectId, context.shotId, todoId, patch);
    else if (context.isSpecialContext && context.specialContextId)
      s.updateSpecialContextTodo(projectId, context.specialContextId, todoId, patch);
    else if (context.isScene && context.sceneId)
      s.updateSceneTodo(projectId, context.sceneId, todoId, patch);
    else
      s.updateTodo(projectId, todoId, patch);
  };

  return { todos: context.todos, add, toggle, remove, update };
}
