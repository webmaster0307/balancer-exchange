import React from 'react';
import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';
import styled from 'styled-components';
import Web3ReactManager from 'components/Web3ReactManager';
import Header from 'components/Header';
import GeneralNotification from 'components/GeneralNotification';
import SwapForm from 'components/SwapForm';
import './App.css';

const BuildVersion = styled.div`
    display: flex;
    flex-direction: row;
    text-align: center;
    margin: 20px;
    font-size: 10px;
    color: var(--body-text);
    position: fixed;
    bottom: 0px;
    @media screen and (max-width: 1024px) {
        display: none;
    }
`;

const BuildLink = styled.a`
    color: var(--body-text);
    text-decoration: none;
    margin-left: 5px;
`;

const App = () => {
    const PoolSwapView = props => {
        const { tokenIn, tokenOut } = props.match.params;

        return <SwapForm tokenIn={tokenIn} tokenOut={tokenOut} />;
    };

    const buildId = process.env.REACT_APP_COMMIT_REF || '';

    const renderViews = () => {
        return (
            <div className="app-shell">
                <Switch>
                    <Route
                        path="/swap/:tokenIn?/:tokenOut?"
                        component={PoolSwapView}
                    />
                    <Redirect from="/" to="/swap" />
                </Switch>
            </div>
        );
    };

    return (
        <Web3ReactManager>
            <HashRouter>
                <Header />
                <GeneralNotification />
                {renderViews()}
                <BuildVersion>
                    BUILD ID:{' '}
                    <BuildLink
                        href={`https://github.com/balancer-labs/balancer-exchange/tree/${buildId}`}
                        target="_blank"
                    >
                        {buildId.substring(0, 12)}
                    </BuildLink>
                </BuildVersion>
            </HashRouter>
        </Web3ReactManager>
    );
};

export default App;
