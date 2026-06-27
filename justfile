set shell := ["bash", "-uc"]

fmt:
    corepack pnpm exec prettier --write .

gen:
    corepack pnpm run i18n:extract
    corepack pnpm run bddgen

test:
    corepack pnpm run test

check:
    corepack pnpm run typecheck
    corepack pnpm exec prettier --check .
    git diff --check

e2e:
    corepack pnpm run test:e2e

build:
    corepack pnpm run build

run:
    corepack pnpm run dev
