CI Integration — Wireframe Review Action
=========================================

A reusable GitHub Action that automatically reviews pull requests for changes
that may require wireframe demo updates. It auto-discovers wireframe demos in
your documentation, analyzes the PR diff, and posts a comment with suggested
wireframe changes using an LLM.


Quick Setup
-----------

Add a single workflow file to your repository:

.. code-block:: yaml
   :caption: ``.github/workflows/wireframe-review.yml``

   name: Wireframe Review
   on:
     pull_request:
       types: [opened, synchronize]
   jobs:
     review:
       runs-on: ubuntu-latest
       permissions:
         pull-requests: write
         contents: write
         models: read
       steps:
         - uses: actions/checkout@v4
         - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           with:
             docs-root: docs/
             source-root: .

That's it. The action will:

1. **Auto-discover** all wireframe demos in your ``docs/`` directory by scanning for
   ``.. wireframe-demo::`` directives in RST files and ``data-wireframe-demo``
   attributes in HTML/Jinja templates.

2. **Resolve** the wireframe HTML, CSS, and custom actions JS files by following
   references and searching common locations (``_static/``, package static dirs, etc.).

3. **Analyze** the PR diff against each discovered wireframe using an LLM.

4. **Post a PR comment** summarizing whether each wireframe needs updating, with
   specific suggested diffs.

.. note::

   Use ``contents: write`` (not ``contents: read``) if you plan to enable
   ``auto-apply`` or ``/wireframe-apply``, since the action needs to push
   commits and create branches.


How It Works
------------

Auto-Discovery
^^^^^^^^^^^^^^

The action scans your ``docs-root`` directory recursively for wireframe demos:

**RST files** — Finds ``.. wireframe-demo::`` directives and extracts:

- The wireframe HTML path (the directive argument)
- Step definitions from ``:steps:`` or ``:steps-json:`` options
- Custom CSS/JS from ``:css:`` and ``:js:`` options

**HTML/Jinja files** — Finds ``data-wireframe-demo`` attributes and extracts:

- The ``htmlSrc`` from the ``data-wireframe-config`` JSON
- Step definitions from the ``steps`` array in the config
- Handles Jinja ``{{ pathto(...) }}`` expressions

For each discovered wireframe HTML file, the action also looks for **sibling
assets** — matching CSS and JS files in the same directory (e.g.,
``my-wireframe.html`` → ``my-wireframe.css`` + ``my-wireframe-actions.js``).


LLM Analysis
^^^^^^^^^^^^^

The action sends the wireframe artifacts (HTML, CSS, custom actions JS, step
definitions) along with the PR diff to an LLM, which determines:

- Whether the source code changes affect the wireframe's layout, components,
  styling, features, or workflows
- Specific file changes to propose (wireframe HTML updates, new/modified steps,
  CSS adjustments, custom action changes)

The LLM understands the wireframe demo format, including built-in actions
(``click``, ``toggle-class``, ``type-text``, ``set-value``, etc.) and custom registered actions.


Step Validation
^^^^^^^^^^^^^^^^

Before calling the LLM, the action runs **deterministic validation** of the
step definitions against the wireframe HTML. This catches issues that don't
require an LLM to detect:

- **Selector checks**: Every CSS selector referenced in a step target (``#id``,
  ``.class``, ``[data-attr]``) is checked against the wireframe HTML to verify
  a matching element exists.

- **Action checks**: Every action name used in steps is verified against the
  list of built-in actions and any custom actions registered in the custom
  actions JS file (detected via ``WireframeDemo.registerAction(...)`` calls).

Validation issues are:

1. **Reported in the PR comment** as a dedicated "Step/Selector Validation"
   section, independent of the LLM analysis.
2. **Included in the LLM prompt** so the model can propose fixes for the
   mismatched selectors or unknown actions in its suggested changes.

This means that even if the LLM is unavailable or produces a poor response,
the deterministic validation will still flag broken step definitions.


Inputs
------

.. list-table::
   :header-rows: 1
   :widths: 20 15 65

   * - Input
     - Default
     - Description
   * - ``docs-root``
     - ``docs/``
     - Path to the documentation root directory to scan for wireframe demos.
   * - ``source-root``
     - ``.``
     - Path to the source code root. Only diffs under this path are analyzed.
   * - ``config-path``
     - *(empty)*
     - Path to an explicit config file (see `Explicit Configuration`_ below).
   * - ``provider``
     - ``github-models``
     - LLM provider: ``github-models``, ``openai``, or ``anthropic``.
   * - ``model``
     - *(provider default)*
     - LLM model name.
   * - ``api-key``
     - *(empty)*
     - API key for OpenAI/Anthropic providers. Not needed for ``github-models``.
   * - ``max-diff-size``
     - ``50000``
     - Maximum diff size (characters) sent to the LLM. Larger diffs are summarized.
   * - ``max-prompt-tokens``
     - ``100000``
     - Maximum total prompt tokens for each LLM request. The diff is truncated to
       fit within this budget after the wireframe content. Lower this for providers
       with small context windows (e.g., ``8000`` for GitHub Models free tier).
   * - ``fail-on-error``
     - ``false``
     - Fail the action (non-zero exit) when validation errors are found or the LLM
       suggests wireframe updates are needed. Set to ``true`` to block PR merges
       via required status checks.
   * - ``auto-apply``
     - ``false``
     - Automatically push suggested wireframe changes directly to the PR branch.
       When ``true``, a suggestion PR is created targeting the PR branch rather than
       requiring a ``/wireframe-apply`` comment. Only works for same-repo PRs
       (not forks). See `Auto-Apply`_ for details.


LLM Provider Setup
-------------------

GitHub Models (recommended)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The default provider uses `GitHub Models <https://github.com/marketplace/models>`_
via the built-in ``GITHUB_TOKEN``. This requires **no additional secrets** — it
works out of the box for public repositories.

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

Add ``permissions: models: read`` to the job for GitHub Models access.


OpenAI
^^^^^^

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       provider: openai
       api-key: ${{ secrets.OPENAI_API_KEY }}
       model: gpt-4o


Anthropic
^^^^^^^^^

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       provider: anthropic
       api-key: ${{ secrets.ANTHROPIC_API_KEY }}
       model: claude-sonnet-4-20250514


API Keys for Organization Repos
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

For organizations, the recommended approaches:

1. **GitHub Models** (zero setup) — Uses the existing ``GITHUB_TOKEN``. No
   secrets to manage. Works for public repos automatically.

2. **Organization secret** — An org admin creates a secret (e.g.,
   ``LLM_API_KEY``) at the org level (Settings → Secrets → Actions), scoped
   to specific repos or all repos. All repos in the org can then reference
   ``${{ secrets.LLM_API_KEY }}``.

3. **Repository secret** — Each repo sets its own secret in
   Settings → Secrets → Actions.


Explicit Configuration
-----------------------

For advanced control, create a ``.github/wireframe-review.yml`` config file
instead of relying on auto-discovery:

.. code-block:: yaml
   :caption: ``.github/wireframe-review.yml``

   wireframes:
     - html: path/to/wireframe.html
       css: path/to/wireframe.css
       actions-js: path/to/wireframe-actions.js
       steps-source: docs/_templates/index.html
       context: "Main landing page demo showing data loading workflow"
       watch:
         - "mypackage/configs/**"
         - "mypackage/components/**"

Then reference it in your workflow:

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       config-path: .github/wireframe-review.yml

The ``watch`` patterns limit which source files are considered relevant,
reducing token usage for large PRs.


Example: jdaviz
----------------

For `jdaviz <https://github.com/spacetelescope/jdaviz>`_, which uses
``data-wireframe-demo`` in a Jinja template with custom actions:

.. code-block:: yaml
   :caption: ``.github/workflows/wireframe-review.yml``

   name: Wireframe Review
   on:
     pull_request:
       types: [opened, synchronize]
   jobs:
     review:
       runs-on: ubuntu-latest
       permissions:
         pull-requests: write
         contents: write
         models: read
       steps:
         - uses: actions/checkout@v4
         - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
           env:
             GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
           with:
             docs-root: docs/
             source-root: jdaviz/
             fail-on-error: 'true'
             auto-apply: 'true'

The action auto-discovers the wireframe demo in ``docs/_templates/index.html``,
resolves ``jdaviz-wireframe.html`` (found via filename search in the repo),
picks up the sibling ``jdaviz-wireframe.css`` and
``jdaviz-wireframe-actions.js``, and analyzes diffs under ``jdaviz/``.


Analysis Scenarios
-------------------

The action handles three scenarios depending on what changed in the PR:

Source code changed, wireframe not changed
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The most common case. A developer modifies the application source (e.g., adds a
toolbar button, renames a plugin, changes a sidebar layout) but doesn't touch
the wireframe files. The action analyzes the source diff and determines whether
any wireframe artifacts (HTML, CSS, custom actions JS, or step definitions) need
updating to stay in sync. If so, it posts suggested changes.

Wireframe changed, source code not changed
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A developer directly updates the wireframe (e.g., refines the demo, fixes a
styling issue, updates step captions). The action reviews the wireframe changes
for **consistency**: do the step definitions reference elements that exist in the
HTML? Are custom actions used correctly? Is the HTML well-structured?

Both source and wireframe changed
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A developer updates both the source code and the wireframe in the same PR. The
action verifies the wireframe updates are **sufficient** for the source changes —
catching cases where the wireframe was partially updated but missed something
(e.g., a new plugin was added to the source but not to the wireframe's plugin
list).

No relevant changes
^^^^^^^^^^^^^^^^^^^^

If the PR only touches files outside ``source-root`` (e.g., documentation text,
CI config) and doesn't modify any wireframe artifacts, the action exits silently
without posting a comment.


PR Comment Format
------------------

The action posts a PR comment that includes:

- A summary of whether each wireframe needs updating
- Collapsible sections with suggested diffs for each file
- A list of wireframes that need no changes
- Warnings for any analysis errors (including token-limit exceeded guidance)

**Comment update behavior:**

- **Suggestions** (wireframe updates needed) — The action edits a single
  existing comment, keeping all suggestions consolidated in one place. On
  subsequent pushes, the same comment is updated with the latest analysis.

- **No changes needed / errors** — A new comment is created as a separate
  timeline entry, so it's clear when the status changed. If the latest bot
  comment already says the same thing (e.g., two consecutive "no changes needed"
  runs), the duplicate is skipped.


Applying Suggestions
---------------------

There are two ways to apply the wireframe changes suggested by the action:

Auto-Apply
^^^^^^^^^^^

Set ``auto-apply: true`` to have the action automatically create a suggestion PR
targeting the PR branch whenever the LLM identifies needed wireframe changes:

.. code-block:: yaml

   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main
     env:
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     with:
       auto-apply: 'true'

When auto-apply is enabled:

1. The action analyzes the PR diff as usual.
2. If the LLM suggests wireframe changes, a new branch
   (``wireframe-suggestions/pr-<N>``) is created with the suggested edits
   applied, and a PR is opened targeting the original PR branch.
3. The review comment notes that suggestions were applied automatically and
   links to the suggestion PR.
4. If the PR already includes wireframe file changes, auto-apply is **skipped**
   to avoid overwriting intentional manual edits.

After reviewing the suggestion PR, merge it into your PR branch to accept the
changes. The next push will trigger a re-run, which should confirm no further
changes are needed.

Manual Apply via Comment
^^^^^^^^^^^^^^^^^^^^^^^^^

Without ``auto-apply``, the action embeds the suggested replacements as hidden
data in the PR comment. Reply to the PR with ``/wireframe-apply`` to trigger a
workflow that reads the suggestions and creates a PR with the changes.

.. note::

   The ``/wireframe-apply`` command requires an ``issue_comment`` trigger in the
   workflow **on the default branch**. For most setups, ``auto-apply`` is simpler
   and recommended.


Token Limits
-------------

The GitHub Models free tier has an 8,000-token limit. The action compresses
wireframe artifacts (stripping non-structural CSS, extracting only custom action
names from JS) to fit within this budget, but large wireframes or diffs may
still exceed it.

If you hit the token limit, the PR comment will include guidance. Your options:

1. **Use a provider with a larger context window** — Switch to ``openai`` or
   ``anthropic`` with an API key:

   .. code-block:: yaml

      with:
        provider: openai
        api-key: ${{ secrets.OPENAI_API_KEY }}

2. **Lower ``max-prompt-tokens``** to more aggressively truncate content (may
   reduce analysis quality):

   .. code-block:: yaml

      with:
        max-prompt-tokens: '4000'
