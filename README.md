# ParsECS

Parsecs is a tiny and pure [Entity Component System](https://en.wikipedia.org/wiki/Entity_component_system) (ECS) library written in TypeScript.

## Usage

ECS is a pattern mainly used in simulations and games which encourages a 
clean separation between entity data and logic.

In Parsecs, `entities` / things are purely defined by their
`components` which contain the actual data such as a position or a color.

The app logic (`systems`) does not act on specific objects but on all entities containing components of interest, which can be retrieved by querying the app.

For more details, see the [ecs-faq repository](https://github.com/SanderMertens/ecs-faq).

## Example

```typescript
import { createApp, ComponentTypes } from '../src/parsecs';
import { createClock, Vec2, vec2, drawCircle } from './utils';

type Components = ComponentTypes<{
  body: { position: Vec2, mass: number },
  movement: { acceleration: Vec2, velocity: Vec2 },
  shape: { radius: number, color: string },
}>;

// resources can be accessed from all systems
type Resources = {
  getDelta: () => number,
};

createApp<Components, Resources>({ getDelta: createClock() })
  .addStartupSystem(app => {
    // add a circular body (planet)
    app.addEntity([
      { type: 'body', position: vec2(200, 100), mass: 800_000 },
      { type: 'shape', radius: 150, color: 'aquamarine' },
    ]);

    // add a circular body that can move (golf ball)
    app.addEntity([
      { type: 'body', position: vec2(100, 100), mass: 2 },
      { type: 'movement', acceleration: vec2(0, -9.81), velocity: vec2(0, 0) },
      { type: 'shape', radius: 6, color: 'white' },
    ]);
  })
  // physics system
  .addSystem(app => {
    const deltaT = app.resources.getDelta();

    // only query entities that can move (golf balls)
    for (const [
      { position }, { acceleration, velocity }
    ] of app.queryIter('body', 'movement')) {
      velocity.x += deltaT * acceleration.x;
      velocity.y += deltaT * acceleration.y;

      position.x += deltaT * velocity.x;
      position.y += deltaT * velocity.y;
    }
  })
  // drawing system
  .addSystem(app => {
    // query all entities with a shape and a position
    for (const [{ radius, color }, { position }] of app.queryIter('shape', 'body')) {
      drawCircle(position, radius, color);
    }
  })
  // run the app!
  .run();
```