# Generate Skill Command

## Purpose
Create a new skill that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.

## Usage
```
generate-skill --name <skill-name> --description <description> [--category <category>]
```

## Parameters

### Required
- `--name` - Skill name (kebab-case, e.g., `my-skill`)
- `--description` - Brief description of what the skill does

### Optional
- `--category` - Skill category (e.g., `automation`, `integration`, `analysis`)
- `--template` - Use a specific template (default: `generic`)

## Skill Structure

A skill consists of:
1. **SKILL.md** - Main skill documentation
2. **instructions.md** - Detailed instructions for the skill
3. **examples/** - Usage examples
4. **templates/** - Reusable templates

## SKILL.md Format

```markdown
# Skill Name

## Description
Brief description of what this skill does.

## When to Use
Describe when Claude should use this skill.

## Key Capabilities
- Capability 1
- Capability 2
- Capability 3

## Usage
Provide usage examples and patterns.

## Configuration
Document any configuration options.

## Error Handling
Describe error handling strategies.
```

## Workflow

1. **Define Skill** - Name, description, and category
2. **Create Structure** - Generate skill directory and files
3. **Write Documentation** - Create SKILL.md and instructions
4. **Add Examples** - Include usage examples
5. **Test Skill** - Verify skill works correctly
6. **Register Skill** - Add to skill registry
7. **Document Usage** - Update skill documentation

## Best Practices

### Naming
- Use descriptive, kebab-case names
- Avoid generic names like "helper" or "utility"
- Include domain context (e.g., `drupal-migration`, `api-testing`)

### Documentation
- Write clear, concise descriptions
- Include practical examples
- Document all parameters and options
- Explain error handling

### Reusability
- Design skills to be composable
- Avoid hard-coded values
- Support configuration options
- Make skills mode-agnostic when possible

## Examples

### Create a Drupal Migration Skill
```
generate-skill --name drupal-migration --description "Automate Drupal module migrations" --category drupal
```

### Create an API Testing Skill
```
generate-skill --name api-testing --description "Comprehensive API testing framework" --category testing
```

### Create a Documentation Skill
```
generate-skill --name doc-generator --description "Generate project documentation" --category documentation
```

## Skill Registry

All skills are registered in:
```
agent/skills/
```
(or `~/.roo/skills/` if you are using the optional symlink)

Each skill has its own directory with:
- `SKILL.md` - Skill definition
- `instructions.md` - Detailed instructions
- `examples/` - Usage examples
- `templates/` - Reusable templates

## Integration

Skills are loaded dynamically by modes when needed. To use a skill:

1. Check if skill applies to current task
2. Load skill using `skill` tool
3. Follow skill instructions
4. Execute skill workflow

## Maintenance

- Keep skills focused and single-purpose
- Update documentation as skills evolve
- Remove unused skills
- Test skills regularly
- Document breaking changes

## See Also
- [Skill Creator Guide](../skills/skill-creator/SKILL.md)
- [Available Skills](../skills/)
- [Skill Best Practices](../docs/skill-best-practices.md)
