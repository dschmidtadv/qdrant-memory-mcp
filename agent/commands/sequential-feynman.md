# Sequential Feynman Command

## Purpose
Apply the Feynman Technique sequentially to break down complex concepts into simple, understandable explanations.

## Usage
```
sequential-feynman --topic <topic> [--depth <depth>] [--audience <audience>]
```

## Parameters

### Required
- `--topic` - The concept or topic to explain

### Optional
- `--depth` - Explanation depth (1-5, default: 3)
  - 1: Surface level
  - 2: Basic understanding
  - 3: Intermediate (default)
  - 4: Advanced
  - 5: Expert level
- `--audience` - Target audience (default: `general`)
  - `general` - General audience
  - `technical` - Technical professionals
  - `beginner` - Beginners
  - `expert` - Experts in the field

## The Feynman Technique

The Sequential Feynman approach applies four steps iteratively:

### Step 1: Teach It Simply
Explain the concept as if teaching a child. Use simple language and avoid jargon.

### Step 2: Identify Gaps
Find areas where your explanation breaks down or lacks clarity.

### Step 3: Refine Understanding
Research and clarify the gaps. Deepen your understanding.

### Step 4: Simplify Further
Refine the explanation to be even clearer and more concise.

## Workflow

1. **Choose Topic** - Select concept to explain
2. **Initial Explanation** - Teach it simply (Step 1)
3. **Identify Gaps** - Find unclear areas (Step 2)
4. **Research & Refine** - Deepen understanding (Step 3)
5. **Simplify** - Make explanation clearer (Step 4)
6. **Iterate** - Repeat steps 2-4 as needed
7. **Document** - Save final explanation

## Output Format

```markdown
# Sequential Feynman: [Topic]

## Audience: [Target Audience]
## Depth Level: [1-5]

### Iteration 1: Initial Explanation
[Simple explanation of the concept]

### Iteration 2: Refined Explanation
[Improved explanation addressing gaps]

### Iteration 3: Expert Explanation
[Final, polished explanation]

### Key Insights
- Insight 1
- Insight 2
- Insight 3

### Common Misconceptions
- Misconception 1
- Misconception 2

### Practical Applications
- Application 1
- Application 2
```

## Examples

### Explain Drupal Hooks
```
sequential-feynman --topic "Drupal Hooks" --depth 3 --audience technical
```

### Explain REST APIs
```
sequential-feynman --topic "REST APIs" --depth 2 --audience beginner
```

### Explain Microservices
```
sequential-feynman --topic "Microservices Architecture" --depth 4 --audience technical
```

## Best Practices

### Simplification
- Use analogies and metaphors
- Avoid technical jargon
- Break concepts into smaller parts
- Use concrete examples

### Clarity
- Define all terms clearly
- Explain the "why" not just the "what"
- Use visual descriptions
- Provide practical examples

### Iteration
- Don't settle for the first explanation
- Continuously refine and improve
- Test understanding with questions
- Seek feedback

## Tips for Effective Explanations

1. **Start Simple** - Begin with the simplest possible explanation
2. **Use Examples** - Provide concrete, relatable examples
3. **Avoid Jargon** - Replace technical terms with simple language
4. **Explain Relationships** - Show how concepts connect
5. **Test Understanding** - Ask clarifying questions
6. **Refine Iteratively** - Improve with each iteration

## Integration with Other Commands

Sequential Feynman works well with:
- `generate-skill` - Create skills based on Feynman explanations
- Documentation modes - Generate clear documentation
- Teaching and training - Create educational content

## See Also
- [Feynman Technique](https://en.wikipedia.org/wiki/Feynman_Technique)
- [Learning Strategies](../docs/learning-strategies.md)
- [Documentation Best Practices](../docs/documentation-best-practices.md)
