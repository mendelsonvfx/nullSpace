-- nullSpace - Save Version: export the working Resolve project as the next .drp version
-- (PROJECT_COMP_vNNN.drp) into the project's _GlobalCompose folder.

run(function()
  local project = pm:GetCurrentProject()
  if not project or not is_ours(project:GetName()) then
    notify("Open the nullSpace project first: Workspace > Scripts > nullSpace - Open Project")
    return
  end

  local function exists(path)
    if bmd and bmd.fileexists then return bmd.fileexists(path) end
    local f = io.open(path, "rb")
    if f then f:close() return true end
    return false
  end
  local function path_for(v)
    return string.format("%s\\%s_v%03d.drp", ctx.version_dir, ctx.base_name, v)
  end

  -- next_version comes from nullSpace (Unicode-safe); skipping existing files covers versions saved since then
  local n = ctx.next_version
  while exists(path_for(n)) do n = n + 1 end

  pm:SaveProject()
  if pm:ExportProject(project:GetName(), path_for(n), false) then
    notify(string.format("Saved version v%03d\n%s", n, path_for(n)))
  else
    notify("Export failed: " .. path_for(n))
  end
end)
