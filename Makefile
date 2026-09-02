.PHONY: help install-modes validate-symlinks clean-symlinks install-jira

# Default target
help:
	@echo "Roo Agent Setup - Available Targets"
	@echo "===================================="
	@echo ""
	@echo "install-modes          Run setup script and validate all symlinks"
	@echo "install-jira           Install 'jira' CLI shim to ~/.local/bin"
	@echo "validate-symlinks      Validate existing symlinks"
	@echo "clean-symlinks         Remove all symlinks from ~/.roo/"
	@echo "help                   Display this help message"
	@echo ""
	@echo "Usage:"
	@echo "  make install-modes    # Initial setup for new developers"
	@echo "  make install-jira     # Install jira CLI (run once per machine)"
	@echo "  make validate-symlinks # Check symlink status"
	@echo ""

# Main target: Run setup script and validate
install-modes: setup-script validate-symlinks
	@echo ""
	@echo "✓ Setup complete! VS Code global storage is now bridged."
	@echo ""
	@echo "Next steps:"
	@echo "  1. Restart VS Code to reload global storage"
	@echo "  2. Verify agent modes are available"
	@echo "  3. Run 'make validate-symlinks' to verify setup"

# Run the setup script
setup-script:
	@echo "Running setup script..."
	@bash scripts/install-modes.sh

# Validate all symlinks
validate-symlinks:
	@echo ""
	@echo "Validating symlinks..."
	@bash -c '\
		ROO_HOME="$$HOME/.roo"; \
		VALID=0; \
		INVALID=0; \
		if [[ ! -d "$$ROO_HOME" ]]; then \
			echo "✗ ~/.roo directory does not exist"; \
			exit 1; \
		fi; \
		for symlink in $$ROO_HOME/rules-*; do \
			if [[ -L "$$symlink" ]]; then \
				target=$$(readlink "$$symlink"); \
				if [[ -d "$$target" ]]; then \
					echo "✓ $$(basename $$symlink) → $$target"; \
					((VALID++)); \
				else \
					echo "✗ $$(basename $$symlink) → $$target (invalid)"; \
					((INVALID++)); \
				fi; \
			fi; \
		done; \
		settings_link="$$ROO_HOME/rules-code/settings/roo-code-settings.json"; \
		if [[ -L "$$settings_link" ]]; then \
			target=$$(readlink "$$settings_link"); \
			if [[ -f "$$target" ]]; then \
				echo "✓ roo-code-settings.json → $$target"; \
				((VALID++)); \
			else \
				echo "✗ roo-code-settings.json → $$target (invalid)"; \
				((INVALID++)); \
			fi; \
		fi; \
		echo ""; \
		echo "Summary: $$VALID valid, $$INVALID invalid"; \
		if [[ $$INVALID -gt 0 ]]; then exit 1; fi \
	'

# Install jira CLI shim to ~/.local/bin
install-jira:
	@echo "Installing jira CLI shim..."
	@bash scripts/install-jira-cli.sh

# Clean up symlinks (with confirmation)
clean-symlinks:
	@echo "This will remove all symlinks from ~/.roo/"
	@read -p "Are you sure? (y/N) " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		bash -c '\
			ROO_HOME="$$HOME/.roo"; \
			if [[ -d "$$ROO_HOME" ]]; then \
				find "$$ROO_HOME" -maxdepth 1 -type l -name "rules-*" -delete; \
				echo "✓ Symlinks removed"; \
			else \
				echo "✗ ~/.roo directory does not exist"; \
			fi \
		'; \
	else \
		echo "Cancelled"; \
	fi
