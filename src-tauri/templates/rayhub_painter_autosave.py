"""
nullSpace: saves a new Substance Painter project under the nullSpace version name.

Installed by nullSpace into Painter's python/startup folder. Active only when Painter was launched
by nullSpace to create a new version (RAYHUB_SPP_TARGET set) — otherwise it does nothing.
Only a project created via File > New is saved, once per launch; existing files are never overwritten.
"""

import os

from PySide2 import QtCore

import substance_painter.event as event
import substance_painter.logging as log
import substance_painter.project as project

ENV_TARGET = "RAYHUB_SPP_TARGET"
SAVE_ATTEMPTS = 30  # Painter can be busy right after creating a project — retry once a second

_pending_new = False


def _on_project_created(_e):
    global _pending_new
    # Only a new project (File > New); ProjectOpened is not handled, so opening a project is never touched
    _pending_new = bool(os.environ.get(ENV_TARGET))


def _on_edition_entered(_e):
    global _pending_new
    if not _pending_new:
        return
    _pending_new = False
    _try_save(SAVE_ATTEMPTS)


def _try_save(attempts):
    target = os.environ.get(ENV_TARGET)
    if not target:
        return

    if os.path.exists(target):
        log.warning(f"nullSpace: {target} already exists, not overwriting")
        os.environ.pop(ENV_TARGET, None)
        return

    try:
        project.save_as(target)
    except Exception as e:
        if attempts > 0:
            QtCore.QTimer.singleShot(1000, lambda: _try_save(attempts - 1))
        else:
            log.error(f"nullSpace: could not save the project as {target}: {e}")
        return

    # Once per launch: a second File > New in this session is left alone
    os.environ.pop(ENV_TARGET, None)
    log.info(f"nullSpace: project saved as {target}")


def start_plugin():
    event.DISPATCHER.connect(event.ProjectCreated, _on_project_created)
    event.DISPATCHER.connect(event.ProjectEditionEntered, _on_edition_entered)


def close_plugin():
    event.DISPATCHER.disconnect(event.ProjectCreated, _on_project_created)
    event.DISPATCHER.disconnect(event.ProjectEditionEntered, _on_edition_entered)
