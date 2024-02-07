# source ~/.zshrc

alias gds="git diff --staged -- . ':(exclude)*.lock'"

alias getCommitMessage='gds | ollama run llama2 "use conventional commit notation to create a commit message for this git diff, anythign else"'


# alias getCommitMessage='echo "2+2" | ollama run llama2 "whats the result?"'
git add .

getCommitMessage