
export type Entity = number;

export type Component<Name extends string, T extends object = {}> = T & { type: Name, };

export const createComponent = <
  Name extends string,
  T extends object = {}
>(name: Name, props: T): Component<Name, T> => ({
  type: name,
  ...props,
});

export const componentMaker = <
  Name extends string
>(name: Name) => <T extends object>(props: T): Component<Name, T> => ({
  type: name,
  ...props,
});

export type System<C extends Component<string>, R extends object = {}> = (app: App<C, R>) => void;

export const combineSystems = <
  C extends Component<string>,
  R extends object = {}
>(...systems: System<C, R>[]): System<C, R> => {
  return app => {
    for (let i = 0; i < systems.length; i++) {
      systems[i](app);
    }
  };
};

export const cacheQuery = <
  C extends Component<string>,
  H extends C['type'],
  T extends C['type'][]
>(query: readonly [H, ...T]) => {
  let cache: MapComponentTypes<[H, ...T], C>[] | null = null;

  return {
    invalidate() {
      cache = null;
    },
    get(app: App<C>) {
      if (cache === null) {
        cache = app.query(query);
      }

      return cache;
    }
  };
};

export type MapComponentTypes<U, C> =
  U extends [infer H, ...infer TL] ?
  [C & { type: H }, ...MapComponentTypes<TL, C>] :
  U extends [infer T] ? [C & { type: T }, Entity] : [Entity];

type KeepStrings<T> = T extends string ? T : never;

export type ComponentTypes<C extends Record<string, object>> = {
  [N in KeepStrings<keyof C>]: Component<N, C[N]>
}[KeepStrings<keyof C>];

export class App<C extends Component<string>, R extends object = {}> {
  private entities: Set<Entity>;
  private components: Map<C['type'], Map<Entity, Component<C['type']>>>;
  private startupSystems: System<C, R>[];
  private systems: System<C, R>[];
  private nextId = 0;
  public resources: R;
  private running = false;

  constructor(resources: R) {
    this.resources = resources;
    this.entities = new Set();
    this.components = new Map();
    this.startupSystems = [];
    this.systems = [];
  }

  public addEntity(components: C[] = []) {
    const id = this.nextId++;
    this.entities.add(id);

    for (const comp of components) {
      this.addComponent(id, comp);
    }

    const actions = {
      add: (component: C) => {
        this.addComponent(id, component);
        return actions;
      },
      id,
    };

    return actions;
  }

  public addComponent(entity: Entity, component: C): App<C, R> {
    const type = component.type;
    if (!this.components.has(type)) {
      this.components.set(type, new Map());
    }

    this.components.get(type)?.set(entity, component);

    return this;
  }

  public removeComponent(entity: Entity, componentType: C['type']): App<C, R> {
    this.components.get(componentType)?.delete(entity);
    return this;
  }

  public removeEntity(entity: Entity): App<C> {
    for (const type of this.components.keys()) {
      this.components.get(type)?.delete(entity);
    }

    this.entities.delete(entity);
    return this;
  }

  public getComponent<K extends C['type']>(id: Entity, type: K): C & { type: K } | undefined {
    return this.components.get(type)?.get(id) as C & { type: K };
  }

  public hasComponent<K extends C['type']>(id: Entity, type: K): boolean {
    return this.components.get(type)?.has(id) ?? false;
  }

  public addSystem(system: System<C, R>): App<C, R> {
    this.systems.push(system);
    return this;
  }

  public addStartupSystem(system: System<C, R>): App<C, R> {
    this.startupSystems.push(system);
    return this;
  }

  public removeSystem(system: System<C, R>, startup = false): App<C, R> {
    const systems = startup ? this.startupSystems : this.systems;

    for (let i = 0; i < systems.length; i++) {
      if (systems[i] === system) {
        systems.splice(i, 1);
        break;
      }
    }

    return this;
  }

  public getEntities(): IterableIterator<Entity> {
    return this.entities[Symbol.iterator]();
  }

  public clearEntities(): void {
    this.entities.clear();
    this.components.clear();
  }

  public clearSystems(): void {
    this.systems = [];
    this.startupSystems = [];
  }

  public clear(): void {
    this.clearEntities();
    this.clearSystems();
  }

  private storeQueryTuple<
    T extends readonly C['type'][]
  >(types: T, entity: Entity, tuple: any[]): void {
    tuple[0] = this.getComponent(entity, types[0]);

    for (let i = 1; i < types.length; i++) {
      const type = types[i];
      tuple[i] = this.getComponent(entity, type);
    }

    tuple[types.length] = entity;
  }

  private checkRemainingComponents(entity: Entity, types: readonly C['type'][]): boolean {
    // start at 1 since entiy has a component of type type[0]
    for (let i = 1; i < types.length; i++) {
      if (!this.hasComponent(entity, types[i])) {
        return false;
      }
    }

    return true;
  }

  public query<
    H extends C['type'],
    T extends C['type'][]
  >(types: readonly [H, ...T]): MapComponentTypes<[H, ...T], C>[] {
    const tuples: any[] = [];
    const entities = this.components.get(types[0])?.keys();

    if (entities) {
      for (const entity of entities) {
        if (this.checkRemainingComponents(entity, types)) {
          const tuple = new Array(types.length + 1);
          this.storeQueryTuple(types, entity, tuple);
          tuples.push(tuple);
        }
      }
    }

    return tuples;
  }

  public *queryIter<
    H extends C['type'],
    T extends C['type'][]
  >(types: readonly [H, ...T]): IterableIterator<MapComponentTypes<[H, ...T], C>> {
    const tuple = new Array(types.length + 1);
    const entities = this.components.get(types[0])?.keys();

    if (entities) {
      for (const entity of entities) {
        if (this.checkRemainingComponents(entity, types)) {
          this.storeQueryTuple(types, entity, tuple);
          yield tuple as MapComponentTypes<[H, ...T], C>;
        }
      }
    }
  }

  public step() {
    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i](this);
    }
  }

  private loop = () => {
    if (this.running) {
      this.step();
      requestAnimationFrame(this.loop);
    }
  };

  public run(): App<C, R> {
    this.running = true;
    this.startupSystems.forEach(system => {
      system(this);
    });

    this.loop();
    return this;
  }

  public stop(): App<C, R> {
    this.running = false;
    return this;
  }
}

export const createApp = <C extends Component<string>, R extends object = {}>(resources: R) =>
  new App<C, R>(resources);