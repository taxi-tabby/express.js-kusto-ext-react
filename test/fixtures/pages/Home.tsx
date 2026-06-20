export default function Home(props: { name?: string }) {
    return <div className="home">Hello {props.name ?? 'world'}</div>;
}
