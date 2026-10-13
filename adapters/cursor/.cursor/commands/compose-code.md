Compose the screen the user asked for as one React file in their app, from what
the design system already has. Use the settings already in `design-system.json`
rather than re-asking them. Scale explanation to `user.codingLevel`.

1. **Know the framework.** Read `project.uiFramework` from `design-system.json`.
   Composing in code covers `shadcn` and `tailwind`. For anything else, stop and
   say composing in code doesn't cover that framework yet.
2. **Find the gate settings.** Search the repo's `package.json` files (not under
   `node_modules`) for an `adherence:check` script. If one exists, take its
   `--system`, `--package` and every `--tokens`, each resolved against the
   directory of the `package.json` that holds it. Otherwise ask the user for the
   package specifier the app imports the system from and the token source files,
   and use the repo root as `--system`. Pass every token file: a system whose
   values span modes has one per mode.
3. **Know the target.** Unless the user named it, ask for the screen's name and
   the file path to write it to, inside the app. Write `.tsx`, or `.jsx` when the
   app has no TypeScript.
4. **Read what exists.** Run
   `node .throughline/scripts/compose-code.mjs inventory --system <dir> --package <spec>`.
   Its components, with their variant axes, values, states, `whenToUse` and
   `whenNotToUse`, are the only components the screen may use. Read a listed
   component's own source for its prop names and exported sub-parts
   (`CardHeader`); the inventory records neither.
5. **Plan.** Write the plan as JSON to a scratch file:
   `{ "screen", "file", "components": [{ "name", "variants": { "<axis>": "<value>" } }] }`,
   one entry per component the screen uses, with the variant values it sets. When
   the request needs a component the inventory doesn't have, say so before
   writing and ask: leave it out, use a named existing component instead, or stop.
   Never build a lookalike.
6. **Check the plan.** Run the script with `check --system <dir> --package <spec> --plan <plan file>`
   from the repo root. If it returns errors, nothing has been written: fix the
   plan (a `missing-component` error goes back to the user as in step 5) and check
   again. A `name-taken` error means the file at that path wasn't composed for
   this screen: ask for another path, or for the user to move that file. Write
   the variant values in the casing the returned plan uses.
7. **Write.** Put the marker `// Composed by throughline: <screen>.` on the first
   line, or on the second after a `'use client'` directive. Import components only
   from the package specifier. Plain elements carry layout only (flex, grid, gap,
   padding, sizing); visible text uses semantic elements (`h1`, `p`, `label`);
   everything the user operates is a system component from the plan. Write
   colour, spacing, sizing and type size only as token variables
   (`gap-[var(--space-gap-md)]`, `style={{ padding: 'var(--space-4)' }}`) or the
   utilities the system's preset generates from tokens (`bg-primary`,
   `rounded-md`). Never a raw value, and never Tailwind's default scale
   (`gap-4`, `text-lg`). Handlers are stubs; data and state are the app's.
8. **Gate.** Run the script with
   `gate --system <dir> --package <spec> --tokens <file>... --plan <plan file> --file <screen file>`.
   On a failure, fix the file and run it again, up to three attempts in all. If
   the third still fails, stop: the file stays where it is, marked, and the
   report lists every failure and says a re-run replaces it. Never change the
   plan or skip a rule to make it pass.
9. **Report.** The file's path, whether it replaced an earlier composed one, the
   gate's counts, every gap (each component asked for that doesn't exist, with the
   nearest names the script offered, and what was left out because of it), and
   how to mount the screen in the app's router. Don't edit the router.

Never edit a component, a token or the app's routing. If the screen can't be
built from what the system has, the gap is the finding.

