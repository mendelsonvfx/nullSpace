-- nullSpace - Open Project: open (or create) the Resolve project of the nullSpace project (Compose)
-- and point Deliver at the compose render folder. Timelines are left to the user.
-- After a double-click on a .drp version in nullSpace: import that version as a separate project instead.

run(function()
  -- LoadProject switches away from the current project: save it so its edits aren't lost
  if pm:GetCurrentProject() then pm:SaveProject() end

  -- LoadProject/CreateProject/ImportProject work in the current Project Manager folder: work in the
  -- nullSpace folder, then return the user to the folder they were in
  local prev_folder = remember_folder()
  enter_folder()
  local folder_names = names_of(pm:GetProjectListInCurrentFolder())
  local function in_folder(name)
    for _, n in ipairs(folder_names) do
      if n == name then return true end
    end
    return false
  end

  local project
  if ctx.import_drp ~= "" then
    -- Version snapshot: a separate project, never imported over the working one. Opened again if already imported
    local name = wanted .. " " .. (ctx.import_drp:match("_(v%d+)%.drp$") or "import")
    if in_folder(name) then
      project = pm:LoadProject(name)
    elseif pm:ImportProject(ctx.import_drp, name) then
      project = pm:LoadProject(name)
    end
  else
    -- Current name first, then earlier ones: the nullSpace project was renamed — keep the work, update the name
    for _, name in ipairs(ctx.project_names) do
      if in_folder(name) then
        project = pm:LoadProject(name)
        break
      end
    end
    if project and project:GetName() ~= wanted then project:SetName(wanted) end
    project = project or pm:CreateProject(wanted)
  end

  restore_folder(prev_folder)

  if not project then
    notify("Could not open project " .. wanted)
    return
  end

  if ctx.import_drp ~= "" then
    -- A snapshot is for review/restore: its render settings stay as saved
    notify("Opened version " .. project:GetName())
    return
  end

  if ctx.render_dir ~= "" then
    project:SetRenderSettings({ TargetDir = ctx.render_dir, CustomName = ctx.base_name })
  end
  notify("Opened " .. project:GetName() ..
    (ctx.render_dir ~= "" and ("\nRender folder: " .. ctx.render_dir) or ""))
end)
