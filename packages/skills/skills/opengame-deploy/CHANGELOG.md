# opengame-deploy changelog

## 1.0.7

A build can be 1 GiB zipped and 1.5 GiB unpacked, from 500 MiB and 1 GiB. The CLI sends an archive that large in parts and resumes it where it stopped.

## 1.0.6

Until the CLI is on npm, the install step tells the agent to stop when `opengame` is missing and send the creator to team@opengame.io for a copy, rather than writing in itself.

## 1.0.5

Names the day OpenGame opens and the day jam entries open, read from the launch clock. The install step says to write to team@opengame.io for the CLI while it is not on npm.

## 1.0.4

Before the packages are on npm, the install step says to ask the OpenGame team for the CLI, and copy that only fits a real npm install waits until then.

## 1.0.3

The note about launch no longer prints a date, which lives only in the launch clock, and names every command that answers before launch. The install step follows the docs: it names no npm command until the packages are published.

## 1.0.2

The manifest reference lists only the fields a release uses, and the packaging notes name achievements among what the page provides. The note that OpenGame is not open yet is back at the top.

## 1.0.1

Use the public npm CLI installation and API origin instructions.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
