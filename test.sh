#!/bin/bash

set -e

ollama create ai-git -f Modelfile-old;

ollama run ai-git "$(git diff --staged)";